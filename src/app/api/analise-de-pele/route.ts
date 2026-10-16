import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { getStoreSettings } from "@/lib/catalog/queries";
import { analyzeSkinPhoto, skinAiConfigured, type SkinAiResult } from "@/lib/skin/ai";
import { getSkinCatalog } from "@/lib/skin/catalog";
import { buildSkinPlan } from "@/lib/skin/recommend";
import { IMAGE_PROBLEM_MESSAGE } from "@/lib/skin/taxonomy";
import { getServiceSupabase } from "@/lib/supabase/service";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Per-IP limits (AI calls cost money): a few in a row, and a ceiling per day
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 24 * 3600_000);
  if (recent.filter((t) => now - t < 10 * 60_000).length >= 6 || recent.length >= 25) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (status: number, error: string, message: string) => reply(status, { ok: false, error, message });

const AI_FAILURE: Record<Exclude<SkinAiResult, { ok: true }>["reason"], [number, string]> = {
  not_configured: [503, "A análise de pele ainda não está disponível. Tente de novo mais tarde."],
  refused: [422, "Não conseguimos analisar esta foto. Tente outra foto do rosto, de frente e com boa luz."],
  busy: [503, "O serviço de análise está ocupado agora. Tente de novo em instantes."],
  unavailable: [502, "Não foi possível concluir a análise agora e nenhum resultado foi gerado. Tente de novo em instantes."],
  invalid_output: [502, "Não foi possível concluir a análise agora e nenhum resultado foi gerado. Tente de novo em instantes."],
};

let warnedNoQuota = false;

/**
 * Skin analysis: receives one photo with the customer's consent, re-encodes it in memory (no metadata, at most
 * 1280 px), asks the AI for a cosmetic reading and returns it with products chosen from the real catalogue.
 * The photo is never written to disk, Storage or the database, and never logged.
 */
export async function POST(request: NextRequest) {
  const settings = await getStoreSettings();
  if (!settings.skin_analysis_enabled) return failure(404, "disabled", "A análise de pele não está disponível no momento.");
  if (!skinAiConfigured()) return failure(503, "not_configured", AI_FAILURE.not_configured[1]);

  // per-IP limit only for a real client address; loopback / private addresses (a proxy that does not forward the
  // client's IP, local tests) would put every customer in one bucket. The daily store quota always applies.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  const publicIp = ip && !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:(127|10|192\.168)\.|f[cd][0-9a-f]{2}:|localhost$)/i.test(ip);
  if (publicIp && !allow(ip)) return failure(429, "rate_limited", "Você fez várias análises seguidas. Aguarde alguns minutos para tentar de novo.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(400, "invalid_request", "Não recebemos a foto. Tente enviar de novo.");
  }
  if (form.get("consent") !== "aceito") {
    return failure(400, "consent_required", "Para analisar a foto, confirme que você concorda com o uso da imagem para esta análise.");
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return failure(400, "no_photo", "Escolha ou tire uma foto do seu rosto.");
  if (photo.size > MAX_BYTES) return failure(413, "too_large", "A foto passou de 8 MB. Escolha outra ou tire uma nova.");
  if (!ACCEPTED_TYPES.includes(photo.type)) return failure(415, "unsupported_type", "Formato não aceito. Envie uma foto em JPG, PNG ou WEBP.");

  let jpeg: Buffer;
  try {
    const image = sharp(Buffer.from(await photo.arrayBuffer()), { limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      return failure(415, "unsupported_type", "Formato não aceito. Envie uma foto em JPG, PNG ou WEBP.");
    }
    if (Math.min(meta.width ?? 0, meta.height ?? 0) < 320) {
      return failure(422, "too_small", "A foto tem resolução baixa. Envie uma foto maior, com o rosto bem visível.");
    }
    // .rotate() applies the EXIF orientation; re-encoding drops every metadata block (location, device…)
    jpeg = await image.rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return failure(422, "unreadable", "Não conseguimos abrir essa imagem. Tente outra foto.");
  }

  // daily quota for the whole store (configurable in the admin), only for valid photos
  const service = getServiceSupabase();
  if (service) {
    const { data, error } = await service.rpc("take_skin_analysis_slot");
    if (error) console.error("[análise de pele] cota diária indisponível", error.code ?? "");
    else if (data === false) return failure(429, "daily_limit", "Atingimos o limite de análises de hoje. Tente de novo amanhã.");
  } else if (!warnedNoQuota) {
    warnedNoQuota = true;
    console.warn("[análise de pele] sem SUPABASE_SERVICE_ROLE_KEY: a cota diária não está sendo aplicada");
  }

  // From here the answer streams one JSON object per line: the real stages ("analyzing", "recommending"), then the result
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ stage: "analyzing" });
      try {
        const result = await analyzeSkinPhoto(jpeg);
        if (!result.ok) {
          send({ ok: false, error: result.reason, message: AI_FAILURE[result.reason][1] });
        } else if (!result.analysis.imageOk) {
          send({ ok: false, error: "image_problem", problem: result.analysis.imageProblem, message: IMAGE_PROBLEM_MESSAGE[result.analysis.imageProblem] });
        } else {
          send({ stage: "recommending" });
          const plan = buildSkinPlan(result.analysis.needs, await getSkinCatalog());
          send({ ok: true, analysis: result.analysis, plan, analyzedAt: new Date().toISOString() });
        }
      } catch (error) {
        console.error("[análise de pele] falha inesperada", error instanceof Error ? error.name : "erro");
        send({ ok: false, error: "unavailable", message: AI_FAILURE.unavailable[1] });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
