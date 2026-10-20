"use server";

import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { CHARACTERISTICS, NEEDS, OBSERVATION_STATUS, PRIORITIES } from "./taxonomy";

const text = (max: number) => z.string().trim().min(1).max(max);
const reportSchema = z.object({
  summary: text(700),
  observations: z.array(z.object({ characteristic: z.enum(CHARACTERISTICS), status: z.enum(OBSERVATION_STATUS), finding: text(400), explanation: text(300) })).max(CHARACTERISTICS.length),
  needs: z.array(z.object({ need: z.enum(NEEDS), priority: z.enum(PRIORITIES), reason: text(300) })).max(NEEDS.length),
  limitations: z.array(text(240)).max(4),
  products: z.array(z.object({ id: z.uuid(), slug: z.string().max(200), name: z.string().max(200) })).max(12),
  analyzedAt: z.iso.datetime(),
});
export type SkinReportInput = z.infer<typeof reportSchema>;
export type SavedSkinReport = SkinReportInput & { id: string; createdAt: string };

async function session() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

/** Saves the text of the report in the signed-in customer's account (separate, voluntary consent). Never the photo. */
export async function saveSkinReport(input: unknown, consent: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (consent !== true) return { ok: false, error: "Confirme que deseja salvar o relatório na sua conta." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Não foi possível salvar este relatório." };
  const supabase = await session();
  if (!supabase) return { ok: false, error: "Entre na sua conta para salvar o relatório." };
  const { error } = await supabase.from("skin_reports").insert({ result: parsed.data });
  if (error) {
    if (error.message.includes("too_many_reports")) return { ok: false, error: "Você já tem 20 relatórios salvos. Exclua um em Minha conta para salvar outro." };
    console.error("[análise de pele] relatório não salvo", error.code ?? "");
    return { ok: false, error: "Não foi possível salvar agora. Tente de novo." };
  }
  return { ok: true };
}

export async function getMySkinReports(): Promise<SavedSkinReport[]> {
  const supabase = await session();
  if (!supabase) return [];
  const { data } = await supabase.from("skin_reports").select("id, result, created_at").order("created_at", { ascending: false }).limit(20);
  return (data ?? []).flatMap((r) => {
    const parsed = reportSchema.safeParse(r.result);
    return parsed.success ? [{ ...parsed.data, id: r.id as string, createdAt: r.created_at as string }] : [];
  });
}

export async function deleteMySkinReport(id: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await session();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("skin_reports").delete().eq("id", id);
  return { ok: !error };
}
