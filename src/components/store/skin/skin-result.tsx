"use client";

import { Check, Info, Loader2, Moon, ShoppingBag, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import type { SkinNeedResult, SkinObservation } from "@/lib/skin/analysis";
import type { Recommendation, RoutineSlot, SkinPlan } from "@/lib/skin/recommend";
import { NEED_LABEL, NEEDS, ROUTINE_STEP_LABEL, type SkinNeed } from "@/lib/skin/taxonomy";
import { getMyAccount } from "@/lib/store/account-actions";
import { saveSkinReport } from "@/lib/skin/actions";
import { cn } from "@/lib/utils";
import { useCart } from "../cart-context";
import { cartLineFromProduct } from "../product-actions";

export type SkinResult = {
  analysis: { summary: string; observations: SkinObservation[]; needs: SkinNeedResult[]; limitations: string[] };
  plan: SkinPlan;
  analyzedAt: string;
  /** Needs currently used for the products (the AI's, adjusted by the customer) */
  selectedNeeds: SkinNeed[];
};

/** What the recommendations take care of: starts with the needs the photo suggested; the customer can adjust it. */
export function NeedsPicker({ result, onNeedsChange, updating }: { result: SkinResult; onNeedsChange: (needs: SkinNeed[]) => void; updating: boolean }) {
  const toggle = (need: SkinNeed) =>
    onNeedsChange(result.selectedNeeds.includes(need) ? result.selectedNeeds.filter((n) => n !== need) : [...result.selectedNeeds, need]);
  return (
    <fieldset>
      <legend className="text-[0.8125rem] font-semibold">O que você quer cuidar</legend>
      <p className="mt-1 text-xs text-muted">Começamos pelo que a análise da sua foto indicou. Toque para ajustar: os produtos e a rotina são atualizados.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {NEEDS.map((need) => {
          const on = result.selectedNeeds.includes(need);
          return (
            <button
              key={need}
              type="button"
              aria-pressed={on}
              disabled={updating}
              onClick={() => toggle(need)}
              className={cn("min-h-10 rounded-full border px-3.5 text-[0.8125rem] transition disabled:opacity-60", on ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-ink/40")}
            >
              {NEED_LABEL[need]}
            </button>
          );
        })}
      </div>
      {updating ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando suas recomendações…
        </p>
      ) : null}
    </fieldset>
  );
}

export function SkinDisclaimer() {
  return (
    <div className="flex gap-3 rounded-card border border-line bg-ivory p-4 text-xs leading-relaxed text-ink-soft">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" strokeWidth={1.75} />
      <p>Esta é uma análise cosmética e visual feita a partir de uma foto, não um diagnóstico médico, e não substitui a avaliação de um dermatologista.</p>
    </div>
  );
}

function AddButton({ rec }: { rec: Recommendation }) {
  const { add } = useCart();
  if (rec.product.hasVariants) {
    return (
      <Link href={`/produtos/${rec.product.slug}`} className={buttonClasses("primary", "sm", "w-full")}>
        Escolher opção
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => add(cartLineFromProduct(rec.product), 1)} className={buttonClasses("primary", "sm", "w-full")} aria-label={`Adicionar ${rec.product.name} à sacola`}>
      <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} /> Adicionar à sacola
    </button>
  );
}

export function ProductsView({ plan }: { plan: SkinPlan }) {
  if (!plan.recommendations.length) {
    return (
      <p className="border border-line bg-ivory p-6 text-sm leading-relaxed text-ink-soft">
        No momento não encontramos no catálogo produtos disponíveis que correspondam a estas necessidades. Ajuste acima o que você quer cuidar ou explore o catálogo.
      </p>
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {plan.recommendations.map((rec) => {
        const p = rec.product;
        return (
          <li key={p.id}>
            <article aria-label={p.name} className="flex h-full flex-col border border-line bg-paper">
              <Link href={`/produtos/${p.slug}`} className="relative block aspect-square bg-card">
                {p.image ? <Image src={p.image.url} alt={p.image.alt ?? p.name} fill sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 100vw" className="product-photo object-contain p-6" /> : null}
                <span className="absolute left-3 top-3 rounded-full bg-paper px-2.5 py-1 text-[0.6875rem] font-medium">{ROUTINE_STEP_LABEL[rec.step]}</span>
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">{p.brand.name}</p>
                <h3 className="mt-1 text-[0.9375rem] font-semibold leading-snug">{p.name}</h3>
                <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{p.priceCents != null ? formatBRL(p.priceCents) : "Consultar"}</span>
                  <span className="text-xs text-success">Disponível</span>
                </p>
                {rec.alternativeFor ? <p className="mt-1 text-xs text-muted">Alternativa disponível para {rec.alternativeFor}, que está indisponível.</p> : null}
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{rec.reason}</p>
                {rec.benefits.length ? (
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft">
                    {rec.benefits.map((b) => (
                      <li key={b} className="flex gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-ink" /> {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {rec.howToUse || rec.precautions.length ? (
                  <details className="mt-3 text-xs leading-relaxed text-ink-soft">
                    <summary className="cursor-pointer font-semibold text-ink">Modo de uso e cuidados</summary>
                    {rec.howToUse ? <p className="mt-2">{rec.howToUse}</p> : null}
                    {rec.precautions.map((c) => (
                      <p key={c} className="mt-2 text-muted">
                        {c}
                      </p>
                    ))}
                  </details>
                ) : null}
                <div className="mt-auto grid gap-2 pt-4">
                  <AddButton rec={rec} />
                  <Link href={`/produtos/${p.slug}`} className={buttonClasses("outline", "sm", "w-full")}>
                    Ver produto
                  </Link>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function RoutineColumn({ title, icon: Icon, slots, byId }: { title: string; icon: typeof Sun; slots: RoutineSlot[]; byId: Map<string, Recommendation> }) {
  return (
    <section aria-label={`Rotina da ${title.toLowerCase()}`} className="border border-line bg-paper p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-rose-ink" strokeWidth={1.75} /> {title}
      </h3>
      <ol className="mt-4 space-y-4">
        {slots.map((slot, i) => {
          const rec = slot.productId ? byId.get(slot.productId) : undefined;
          return (
            <li key={`${slot.step}-${i}`} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose text-xs font-semibold text-rose-ink">{i + 1}</span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{ROUTINE_STEP_LABEL[slot.step]}</p>
                {rec ? (
                  <>
                    <Link href={`/produtos/${rec.product.slug}`} className="text-ink-soft underline-offset-4 hover:underline">
                      {rec.product.name}
                    </Link>
                    <p className="text-xs text-muted">{rec.reason}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted">Ainda não temos uma opção adequada para esta etapa no catálogo.</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RoutineView({ plan }: { plan: SkinPlan }) {
  const { add } = useCart();
  const [confirming, setConfirming] = useState(false);
  const [added, setAdded] = useState(false);
  const byId = new Map(plan.recommendations.map((r) => [r.product.id, r]));
  const ids = [...new Set([...plan.routine.manha, ...plan.routine.noite].map((s) => s.productId).filter((x): x is string => Boolean(x)))];
  const items = ids.map((id) => byId.get(id)).filter((r): r is Recommendation => Boolean(r));
  const addable = items.filter((r) => !r.product.hasVariants && r.product.priceCents != null);
  const withVariants = items.filter((r) => r.product.hasVariants);
  const total = addable.reduce((sum, r) => sum + (r.product.priceCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <RoutineColumn title="Manhã" icon={Sun} slots={plan.routine.manha} byId={byId} />
        <RoutineColumn title="Noite" icon={Moon} slots={plan.routine.noite} byId={byId} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        A rotina organiza produtos do catálogo da MIVORA pelas necessidades escolhidas. Siga sempre o modo de uso da embalagem e introduza um produto novo por vez. Ela não é um tratamento médico.
      </p>
      {addable.length ? (
        <div className="border border-line bg-ivory p-5">
          {added ? (
            <p className="flex flex-wrap items-center gap-3 text-sm" role="status">
              <Check className="h-4 w-4 text-success" /> Rotina adicionada à sacola.
              <Link href="/carrinho" className="font-semibold underline underline-offset-4">
                Ver sacola
              </Link>
            </p>
          ) : confirming ? (
            <div role="group" aria-labelledby="confirmar-rotina">
              <p id="confirmar-rotina" className="text-sm font-semibold">
                Estes produtos serão adicionados à sua sacola:
              </p>
              <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
                {addable.map((r) => (
                  <li key={r.product.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0">1 × {r.product.name}</span>
                    <span className="shrink-0 tabular-nums">{formatBRL(r.product.priceCents ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between text-sm font-semibold">
                <span>Total dos produtos</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </p>
              {withVariants.length ? <p className="mt-2 text-xs text-muted">{withVariants.map((r) => r.product.name).join(", ")}: escolha a opção na página do produto.</p> : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClasses("primary", "md")}
                  onClick={() => {
                    for (const r of addable) add(cartLineFromProduct(r.product), 1);
                    setConfirming(false);
                    setAdded(true);
                  }}
                >
                  Confirmar e adicionar
                </button>
                <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm">
                {addable.length} {addable.length === 1 ? "produto" : "produtos"} · <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
              </p>
              <button type="button" className={buttonClasses("primary", "md", "w-full sm:w-auto")} onClick={() => setConfirming(true)}>
                <ShoppingBag className="h-4 w-4" strokeWidth={1.75} /> Adicionar rotina à sacola
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Optional: keep the text of the report in the account (separate consent, never the photo). */
export function SaveReport({ result }: { result: SkinResult }) {
  const [account, setAccount] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });

  useEffect(() => {
    let cancelled = false;
    getMyAccount()
      .catch(() => null)
      .then((a) => !cancelled && setAccount(Boolean(a)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (account === null) return null;
  if (!account) {
    return (
      <p className="text-xs text-muted">
        Quer guardar este relatório? <Link href="/minha-conta" className="font-semibold underline underline-offset-4">Entre na sua conta</Link> antes de fazer a próxima análise.
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="text-sm text-success" role="status">
        Relatório salvo em Minha conta.
      </p>
    );
  }
  return (
    <div className="border border-line p-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Quero salvar o texto deste relatório e os produtos sugeridos na minha conta (sem a foto), por até 12 meses. Posso excluir quando quiser.</span>
      </label>
      {state.message ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!consent || state.busy}
        className={buttonClasses("outline", "sm", "mt-3")}
        onClick={async () => {
          setState({ busy: true, message: null, ok: false });
          const r = await saveSkinReport(
            {
              summary: result.analysis.summary,
              observations: result.analysis.observations,
              needs: result.analysis.needs,
              limitations: result.analysis.limitations,
              products: result.plan.recommendations.map((x) => ({ id: x.product.id, slug: x.product.slug, name: x.product.name })),
              analyzedAt: result.analyzedAt,
            },
            consent,
          ).catch(() => ({ ok: false as const, error: "Não foi possível salvar agora. Tente de novo." }));
          setState(r.ok ? { busy: false, message: null, ok: true } : { busy: false, message: r.error, ok: false });
        }}
      >
        Salvar relatório
      </button>
    </div>
  );
}
