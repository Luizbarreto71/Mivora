"use client";

import { ArrowLeft, ArrowRight, Camera, Check, ImageUp, Loader2, RefreshCw, ScanFace, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import type { SkinNeedResult, SkinObservation } from "@/lib/skin/analysis";
import { planForNeeds } from "@/lib/skin/actions";
import { rememberPopup } from "@/lib/skin/popup-schedule";
import type { SkinPlan } from "@/lib/skin/recommend";
import type { SkinNeed } from "@/lib/skin/taxonomy";
import { cn } from "@/lib/utils";
import { preparePhoto, type PreparedPhoto } from "./prepare-photo";
import { NeedsPicker, ProductsView, RoutineView, SaveReport, SkinDisclaimer, type SkinResult } from "./skin-result";

type Step = "inicio" | "consentimento" | "foto" | "analise" | "produtos" | "rotina";
const STEPS: { key: Step; label: string }[] = [
  { key: "inicio", label: "Início" },
  { key: "consentimento", label: "Consentimento" },
  { key: "foto", label: "Foto" },
  { key: "analise", label: "Análise" },
  { key: "produtos", label: "Produtos" },
  { key: "rotina", label: "Rotina" },
];
type Stage = "preparing" | "uploading" | "analyzing" | "recommending";
const STAGE_TEXT: Record<Stage, string> = {
  preparing: "Preparando sua foto…",
  uploading: "Enviando sua foto com segurança…",
  analyzing: "Observando características visuais da pele…",
  recommending: "Organizando suas recomendações…",
};

/** The result (text only, never the photo) stays in this browser tab, so "Ver produto" and back keep it */
const RESULT_KEY = "mivora.skin.result.v1";
const readResult = (): SkinResult | null => {
  try {
    const r = JSON.parse(sessionStorage.getItem(RESULT_KEY) ?? "null") as SkinResult | null;
    return r && r.analysis && r.plan ? r : null;
  } catch {
    return null;
  }
};
const storeResult = (r: SkinResult | null) => {
  try {
    if (r) sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
    else sessionStorage.removeItem(RESULT_KEY);
  } catch {
    /* private mode: the result simply is not kept */
  }
};

type ApiSuccess = { ok: true; analysis: { summary: string; observations: SkinObservation[]; needs: SkinNeedResult[]; limitations: string[] }; plan: SkinPlan; analyzedAt: string };
type ApiFailure = { ok: false; error: string; message: string };

export function SkinAnalysisFlow({ available, intervalDays }: { available: boolean; intervalDays: number }) {
  const [step, setStep] = useState<Step>("inicio");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [failure, setFailure] = useState<{ message: string; retry: boolean; newPhoto: boolean } | null>(null);
  const [result, setResult] = useState<SkinResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<PreparedPhoto | null>(null);

  useEffect(() => {
    const saved = readResult();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(saved);
      setStep("produtos");
    }
    return () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    };
  }, []);

  const go = (next: Step) => {
    setStep(next);
    window.requestAnimationFrame(() => {
      headingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      headingRef.current?.focus({ preventScroll: true });
    });
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setPreparing(true);
    const prepared = await preparePhoto(file);
    setPreparing(false);
    if ("error" in prepared) {
      setPhotoError(prepared.error);
      return;
    }
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    photoRef.current = prepared;
    setPhoto(prepared);
  };

  const discardPhoto = () => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    photoRef.current = null;
    setPhoto(null);
  };

  const analyze = async () => {
    if (!photo || !consent) return;
    setFailure(null);
    setStage("uploading");
    go("analise");
    const body = new FormData();
    body.append("photo", photo.blob, "foto.jpg");
    body.append("consent", "aceito");
    let outcome: ApiSuccess | ApiFailure | null = null;
    try {
      const response = await fetch("/api/analise-de-pele", { method: "POST", body });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as ApiFailure | null;
        outcome = data ?? { ok: false, error: "network", message: "Não foi possível concluir a análise agora e nenhum resultado foi gerado. Tente de novo em instantes." };
      } else {
        // one JSON object per line: the server's real stages, then the result
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as { stage?: Stage } & Partial<ApiSuccess | ApiFailure>;
            if (event.stage) setStage(event.stage);
            else outcome = event as ApiSuccess | ApiFailure;
          }
          if (done) break;
        }
      }
    } catch {
      outcome = null;
    }
    setStage(null);
    if (!outcome) {
      setFailure({ message: "A conexão caiu antes de a análise terminar. Nenhum resultado foi gerado. Tente de novo.", retry: true, newPhoto: false });
      return;
    }
    if (!outcome.ok) {
      const photoProblem = ["image_problem", "too_small", "unreadable", "unsupported_type", "too_large", "refused"].includes(outcome.error);
      setFailure({ message: outcome.message, retry: !photoProblem && outcome.error !== "daily_limit" && outcome.error !== "rate_limited", newPhoto: photoProblem });
      return;
    }
    const next: SkinResult = { analysis: outcome.analysis, plan: outcome.plan, analyzedAt: outcome.analyzedAt, selectedNeeds: outcome.analysis.needs.map((n) => n.need) };
    setResult(next);
    storeResult(next);
    go("produtos");
  };

  const changeNeeds = async (needs: SkinNeed[]) => {
    if (!result) return;
    const ranked = needs.map((need) => ({ need, priority: result.analysis.needs.find((n) => n.need === need)?.priority ?? ("media" as const) }));
    setUpdating(true);
    const r = await planForNeeds(ranked).catch(() => null);
    setUpdating(false);
    if (!r?.ok) return;
    const next = { ...result, plan: r.plan, selectedNeeds: needs };
    setResult(next);
    storeResult(next);
  };

  const restart = () => {
    storeResult(null);
    setResult(null);
    discardPhoto();
    setFailure(null);
    // a new analysis needs a new consent
    setConsent(false);
    go("consentimento");
  };

  const index = STEPS.findIndex((s) => s.key === step);
  const reachable = (s: Step) => {
    if (s === step || s === "analise") return false;
    if (s === "inicio") return true;
    if (s === "consentimento") return true;
    if (s === "foto") return consent;
    return Boolean(result);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Etapas da análise" className="mb-8 overflow-x-auto">
        <ol className="flex min-w-max gap-1 sm:min-w-0 sm:justify-between">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const done = i < index;
            const content = (
              <span className="flex items-center gap-2 px-1.5 py-1">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold",
                    active ? "border-rose-ink bg-rose-ink text-paper" : done ? "border-rose-ink bg-rose text-rose-ink" : "border-line bg-paper text-muted",
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={cn("text-[0.75rem]", active ? "font-semibold text-ink" : "text-muted", !active && "hidden sm:inline")}>{s.label}</span>
              </span>
            );
            return (
              <li key={s.key} aria-current={active ? "step" : undefined}>
                {reachable(s.key) ? (
                  <button type="button" onClick={() => go(s.key)} className="rounded-sm hover:opacity-80">
                    {content}
                  </button>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div ref={headingRef} tabIndex={-1} className="scroll-mt-32 outline-none">
        {step === "inicio" ? (
          <section aria-labelledby="skin-start" className="mx-auto max-w-2xl text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose text-rose-ink">
              <ScanFace className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <h1 id="skin-start" className="heading-display mt-5 text-[2rem] leading-[1.1] sm:text-[2.75rem]">
              Vamos conhecer melhor a sua pele?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-ink/75">
              Envie uma foto do seu rosto para receber uma análise visual e descobrir produtos que podem complementar sua rotina de cuidados.
            </p>
            {available ? (
              <Button
                size="lg"
                className="mt-8 w-full gap-3 sm:w-auto"
                onClick={() => {
                  rememberPopup("started", intervalDays);
                  go("consentimento");
                }}
              >
                Começar análise <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            ) : (
              <p className="mx-auto mt-8 max-w-md border border-line bg-ivory p-4 text-sm text-ink-soft" role="status">
                A análise de pele está temporariamente indisponível. Tente de novo mais tarde.
              </p>
            )}
            <ol className="mt-10 grid gap-4 text-left sm:grid-cols-3">
              {[
                { icon: Camera, text: "Tire ou selecione uma foto." },
                { icon: Sparkles, text: "Receba uma análise visual personalizada." },
                { icon: ShoppingBag, text: "Descubra produtos recomendados para você." },
              ].map(({ icon: Icon, text }, i) => (
                <li key={text} className="flex items-center gap-3 border border-line bg-paper p-4 text-sm sm:flex-col sm:items-start">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose text-rose-ink">
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <span>
                    <span className="sr-only">Passo {i + 1}: </span>
                    {text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              A análise é cosmética e informativa. Ela não é um diagnóstico médico e não substitui a avaliação de um dermatologista.
            </p>
          </section>
        ) : null}

        {step === "consentimento" ? (
          <section aria-labelledby="skin-consent" className="mx-auto max-w-2xl">
            <h2 id="skin-consent" className="heading-display text-[1.75rem] sm:text-[2.125rem]">
              Antes de começar
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">Veja como a sua foto é usada. Ela só é enviada quando você tocar em “Analisar minha foto”.</p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed">
              {[
                "A foto é usada para analisar características visuais da pele.",
                "A análise serve para sugerir produtos cosméticos da MIVORA.",
                "A imagem não é publicada no site e não é usada para reconhecer quem você é.",
                "A imagem não é usada para treinar modelos de inteligência artificial nem para publicidade.",
                "A imagem não fica armazenada: ela é processada pelo nosso servidor e pelo provedor de IA (Anthropic) e descartada assim que a análise termina, inclusive se der erro.",
                "O resultado em texto fica apenas nesta aba do navegador. Salvar o relatório na sua conta é opcional e pedido à parte.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" strokeWidth={1.75} />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Mais detalhes na{" "}
              <Link href="/politica-de-privacidade" className="underline underline-offset-2" target="_blank">
                política de privacidade
              </Link>
              .
            </p>
            <label className="mt-6 flex items-start gap-3 border border-line bg-paper p-4 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Concordo com o uso da minha foto para esta análise de pele, conforme explicado acima.</span>
            </label>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => go("inicio")} className="inline-flex items-center justify-center gap-2 text-sm text-muted hover:text-ink">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <Button size="lg" className="w-full sm:w-auto" disabled={!consent} onClick={() => go("foto")}>
                Continuar
              </Button>
            </div>
          </section>
        ) : null}

        {step === "foto" ? (
          <section aria-labelledby="skin-photo" className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div>
              <h2 id="skin-photo" className="heading-display text-[1.75rem] sm:text-[2.125rem]">
                Sua foto
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">Para uma análise mais fiel:</p>
              <ul className="mt-3 space-y-2 text-sm">
                {["Rosto centralizado, de frente.", "Luz natural ou uniforme.", "Sem filtros de beleza.", "Sem maquiagem pesada, se possível.", "Rosto visível, sem óculos escuros, máscara ou cabelo na frente.", "Foto nítida, sem tremer."].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" strokeWidth={2} /> {t}
                  </li>
                ))}
              </ul>
              {!consent ? (
                <p className="mt-6 text-sm text-danger" role="alert">
                  Para enviar a foto, volte e confirme o consentimento.
                </p>
              ) : null}
            </div>
            <div>
              <div className="relative mx-auto aspect-[3/4] w-full max-w-[20rem] overflow-hidden rounded-[6px] bg-ivory">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen photo (object URL)
                  <img src={photo.url} alt="Pré-visualização da sua foto" className="h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-x-6 bottom-6 text-center text-xs text-muted">Encaixe o rosto na moldura</span>
                )}
                <span aria-hidden="true" className="pointer-events-none absolute inset-[14%_18%_18%] rounded-[50%] border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(18,18,18,0.12)]" />
                {preparing ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-paper/70" role="status">
                    <Loader2 className="h-6 w-6 animate-spin" aria-label="Preparando a foto" />
                  </span>
                ) : null}
              </div>
              {photoError ? (
                <p className="mt-3 text-center text-sm text-danger" role="alert">
                  {photoError}
                </p>
              ) : null}
              <div className="mx-auto mt-5 grid max-w-[20rem] gap-2.5">
                {photo ? (
                  <>
                    <Button size="lg" className="w-full gap-3" disabled={!consent || preparing} onClick={analyze}>
                      Analisar minha foto <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                    <label className={buttonClasses("outline", "md", "w-full cursor-pointer")}>
                      <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Trocar foto
                      <input type="file" accept="image/*" className="sr-only" aria-label="Trocar foto" onChange={(e) => choose(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
                    </label>
                  </>
                ) : (
                  <>
                    <label className={buttonClasses("primary", "lg", "w-full cursor-pointer")}>
                      <Camera className="h-4 w-4" strokeWidth={1.75} /> Tirar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="sr-only"
                        aria-label="Tirar foto com a câmera"
                        onChange={(e) => choose(e.target.files?.[0]).finally(() => (e.target.value = ""))}
                      />
                    </label>
                    <label className={buttonClasses("outline", "md", "w-full cursor-pointer")}>
                      <ImageUp className="h-4 w-4" strokeWidth={1.75} /> Escolher da galeria
                      <input type="file" accept="image/*" className="sr-only" aria-label="Escolher foto da galeria" onChange={(e) => choose(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
                    </label>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    discardPhoto();
                    go("inicio");
                  }}
                  className="mt-1 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Cancelar
                </button>
              </div>
              <p className="mx-auto mt-3 max-w-[20rem] text-center text-[0.6875rem] text-muted">JPG, PNG, WEBP ou HEIC do celular. A foto é reduzida no seu aparelho antes do envio.</p>
            </div>
          </section>
        ) : null}

        {step === "analise" ? (
          <section aria-labelledby="skin-processing" className="mx-auto max-w-xl text-center">
            <h2 id="skin-processing" className="heading-display text-[1.75rem] sm:text-[2.125rem]">
              {failure ? "Não foi possível concluir" : "Analisando sua foto"}
            </h2>
            {failure ? (
              <div className="mt-6">
                <p className="border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">
                  {failure.message}
                </p>
                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  {failure.retry && photo ? (
                    <Button size="lg" onClick={analyze}>
                      <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Tentar de novo
                    </Button>
                  ) : null}
                  <Button
                    size="lg"
                    variant={failure.retry ? "outline" : "primary"}
                    onClick={() => {
                      if (failure.newPhoto) discardPhoto();
                      setFailure(null);
                      go("foto");
                    }}
                  >
                    {failure.newPhoto ? "Enviar outra foto" : "Voltar para a foto"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-10 flex flex-col items-center">
                <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-rose">
                  <span className="absolute inset-0 rounded-full border-2 border-rose-ink/30 motion-safe:animate-ping" />
                  <ScanFace className="h-9 w-9 text-rose-ink" strokeWidth={1.5} />
                </span>
                <p className="mt-6 text-sm font-medium" role="status" aria-live="polite">
                  {STAGE_TEXT[stage ?? "uploading"]}
                </p>
                <p className="mt-2 max-w-sm text-xs text-muted">Isso costuma levar alguns segundos. Não feche esta página.</p>
              </div>
            )}
          </section>
        ) : null}

        {result && (step === "produtos" || step === "rotina") ? (
          <section aria-labelledby="skin-result">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-rose-ink">Análise de pele com IA</p>
                <h2 id="skin-result" className="heading-display mt-2 text-[1.875rem] sm:text-[2.375rem]">
                  {step === "produtos" ? "Produtos recomendados" : "Sua rotina personalizada"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Resultado da análise">
                {(["produtos", "rotina"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={step === s}
                    onClick={() => go(s)}
                    className={cn("min-h-10 rounded-full border px-4 text-[0.8125rem] transition", step === s ? "border-ink bg-ink text-paper" : "border-line hover:border-ink/40")}
                  >
                    {s === "produtos" ? `Produtos (${result.plan.recommendations.length})` : "Rotina"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              {step === "produtos" ? (
                <div className="space-y-8">
                  <NeedsPicker result={result} onNeedsChange={changeNeeds} updating={updating} />
                  <ProductsView plan={result.plan} />
                </div>
              ) : null}
              {step === "rotina" ? <RoutineView plan={result.plan} /> : null}
            </div>

            <div className="mt-10 space-y-5 border-t border-line pt-6">
              {step === "produtos" ? (
                <Button size="lg" className="w-full gap-3 sm:w-auto" onClick={() => go("rotina")}>
                  Ver minha rotina <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              ) : null}
              <SkinDisclaimer />
              <SaveReport result={result} />
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                <button type="button" onClick={restart} className="inline-flex items-center gap-2 font-semibold underline underline-offset-4">
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Refazer análise
                </button>
                <Link href="/produtos" className="inline-flex items-center gap-2 text-muted underline-offset-4 hover:text-ink hover:underline">
                  Voltar ao catálogo
                </Link>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
