import { z } from "zod";
import {
  CHARACTERISTICS,
  IMAGE_PROBLEMS,
  NEEDS,
  OBSERVATION_STATUS,
  PRIORITIES,
  type Characteristic,
  type ImageProblem,
  type NeedPriority,
  type ObservationStatus,
  type SkinNeed,
} from "./taxonomy";

/** Structured output requested from the model (validated again here: the model's answer is never trusted as-is). */
export const AnalysisOutput = z.object({
  image_ok: z.boolean().describe("true somente se a foto mostra um único rosto humano real, visível e nítido o bastante"),
  image_problem: z.enum(IMAGE_PROBLEMS).nullable().describe("motivo quando image_ok é false; null quando a foto é adequada"),
  summary: z.string().describe("2 ou 3 frases acolhedoras, em português do Brasil, resumindo o que foi observado"),
  observations: z
    .array(
      z.object({
        characteristic: z.enum(CHARACTERISTICS),
        status: z.enum(OBSERVATION_STATUS),
        finding: z.string().describe("o que aparece na foto, em linguagem cosmética e sem termos médicos (até 2 frases)"),
        explanation: z.string().describe("explicação simples do que isso costuma significar para os cuidados com a pele (1 frase)"),
      }),
    )
    .describe("uma entrada por característica avaliada; use sem_evidencia quando a foto não permitir avaliar"),
  needs: z
    .array(
      z.object({
        need: z.enum(NEEDS),
        priority: z.enum(PRIORITIES),
        reason: z.string().describe("por que essa necessidade foi sugerida, ligada ao que foi observado (1 frase)"),
      }),
    )
    .describe("de 1 a 4 necessidades cosméticas sustentadas pelas observações; vazio se a foto não for adequada"),
  limitations: z.array(z.string()).describe("limitações desta foto que podem ter afetado a análise (luz, câmera, maquiagem, ângulo)"),
});
export type AnalysisOutputType = z.infer<typeof AnalysisOutput>;

export type SkinObservation = { characteristic: Characteristic; status: ObservationStatus; finding: string; explanation: string };
export type SkinNeedResult = { need: SkinNeed; priority: NeedPriority; reason: string };

export type SkinAnalysis =
  | { imageOk: false; imageProblem: ImageProblem }
  | { imageOk: true; summary: string; observations: SkinObservation[]; needs: SkinNeedResult[]; limitations: string[] };

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Normalizes the model's answer: one entry per characteristic, in a fixed order, short texts, at most 4 needs. */
export function normalizeAnalysis(raw: AnalysisOutputType): SkinAnalysis {
  if (!raw.image_ok) return { imageOk: false, imageProblem: raw.image_problem ?? "sem_rosto" };
  const seen = new Set<Characteristic>();
  const observations = CHARACTERISTICS.flatMap((c) => {
    const o = raw.observations.find((x) => x.characteristic === c);
    if (!o || seen.has(c)) return [];
    seen.add(c);
    return [{ characteristic: c, status: o.status, finding: clip(o.finding, 320), explanation: clip(o.explanation, 260) }];
  });
  const needSeen = new Set<SkinNeed>();
  const needs = raw.needs
    .filter((n) => (needSeen.has(n.need) ? false : (needSeen.add(n.need), true)))
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
    .slice(0, 4)
    .map((n) => ({ need: n.need, priority: n.priority, reason: clip(n.reason, 260) }));
  return {
    imageOk: true,
    summary: clip(raw.summary, 600),
    observations,
    needs,
    limitations: raw.limitations.map((l) => clip(l, 220)).filter(Boolean).slice(0, 4),
  };
}
