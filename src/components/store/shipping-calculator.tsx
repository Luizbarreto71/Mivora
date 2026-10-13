"use client";

import { Loader2, MapPin, Truck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { formatBRL } from "@/lib/money";
import { addressLabel, formatCep, normalizeCep } from "@/lib/shipping/cep";
import type { ShippingItemRef, ShippingOption, ShippingQuote } from "@/lib/shipping/types";
import { quoteShipping } from "@/lib/store/shipping-actions";
import { cn } from "@/lib/utils";

const CEP_KEY = "mivora.cep";
/** Official Correios CEP search */
const FIND_CEP_URL = "https://buscacepinter.correios.com.br/app/endereco/index.php";

function readSavedCep() {
  try {
    return normalizeCep(localStorage.getItem(CEP_KEY));
  } catch {
    return null;
  }
}

function rememberCep(cep: string) {
  try {
    localStorage.setItem(CEP_KEY, cep);
  } catch {
    /* private mode */
  }
}

/** Right-hand price label of an option. */
export function shippingFeeLabel(option: Pick<ShippingOption, "feeCents" | "method">) {
  if (option.method === "to_arrange" || option.feeCents == null) return "A combinar";
  return option.feeCents === 0 ? "Grátis" : formatBRL(option.feeCents);
}

type Props = {
  items: ShippingItemRef[];
  /** Quote right away with the CEP the visitor already informed (cart, checkout) */
  autoQuote?: boolean;
  /** Checkout: the options become a radio group */
  selectedId?: string | null;
  onSelect?: (option: ShippingOption | null) => void;
  onQuote?: (quote: ShippingQuote | null) => void;
  title?: string;
  className?: string;
};

export function ShippingCalculator({ items, autoQuote = false, selectedId = null, onSelect, onQuote, title = "Calcular frete e prazo", className }: Props) {
  const inputId = useId();
  const [cep, setCep] = useState("");
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const itemsKey = JSON.stringify(items.map((i) => [i.productId, i.variantId, i.kitId, i.quantity]));

  // Latest props for async callbacks, without re-running effects
  const latest = useRef({ items, onSelect, onQuote, selectedId });
  useEffect(() => {
    latest.current = { items, onSelect, onQuote, selectedId };
  });
  const requestId = useRef(0);

  const calculate = useCallback((raw: string) => {
    const normalized = normalizeCep(raw);
    if (!normalized) {
      setError("Digite um CEP válido, com 8 números.");
      return;
    }
    setError(null);
    const id = ++requestId.current;
    startTransition(async () => {
      const refs = latest.current.items.map(({ productId, variantId, kitId, quantity }) => ({ productId, variantId, kitId, quantity }));
      const result = await quoteShipping({ cep: normalized, items: refs }).catch(() => ({
        ok: false as const,
        error: "Não foi possível calcular o frete agora. Tente novamente em instantes.",
      }));
      if (id !== requestId.current) return; // superseded by a newer request
      const { onQuote: notify, onSelect: select, selectedId: current } = latest.current;
      if (!result.ok) {
        setQuote(null);
        setError(result.error);
        notify?.(null);
        select?.(null);
        return;
      }
      rememberCep(normalized);
      setQuote(result.quote);
      notify?.(result.quote);
      if (select) {
        // keep the chosen option (with fresh values) or pre-select the only real choice
        const choosable = result.quote.options.filter((o) => !o.unavailableReason);
        const real = choosable.filter((o) => o.kind !== "arrange");
        select(choosable.find((o) => o.id === current) ?? (real.length === 1 ? real[0] : null));
      }
    });
  }, []);

  // CEP informed earlier (product page, cart) is remembered on this device
  useEffect(() => {
    const saved = readSavedCep();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCep(formatCep(saved));
    if (autoQuote) calculate(saved);
  }, [autoQuote, calculate]);

  // Quantities changed: quote the same CEP again
  const quotedCep = quote?.cep ?? null;
  const lastItems = useRef(itemsKey);
  useEffect(() => {
    if (itemsKey === lastItems.current) return;
    lastItems.current = itemsKey;
    if (!quotedCep) return;
    const timer = setTimeout(() => calculate(quotedCep), 600);
    return () => clearTimeout(timer);
  }, [itemsKey, quotedCep, calculate]);

  const change = (value: string) => {
    const formatted = formatCep(value);
    setCep(formatted);
    const normalized = normalizeCep(formatted);
    if (quote && normalized !== quote.cep) {
      setQuote(null);
      onQuote?.(null);
      onSelect?.(null);
    }
    if (normalized && normalized !== quote?.cep) calculate(normalized);
  };

  return (
    <div className={cn("text-sm", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          calculate(cep);
        }}
      >
        <label htmlFor={inputId} className="mb-2.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">
          <Truck className="h-4 w-4" strokeWidth={1.5} /> {title}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={cep}
            onChange={(e) => change(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            aria-invalid={error ? true : undefined}
            className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-sm tracking-[0.08em] focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="flex h-11 min-w-[6.5rem] shrink-0 items-center justify-center border border-ink px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition hover:bg-ink hover:text-paper disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Calculando" /> : "Calcular"}
          </button>
        </div>
        <a href={FIND_CEP_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-muted underline underline-offset-2 hover:text-ink">
          Não sei meu CEP
        </a>
      </form>

      {error ? (
        <p className="mt-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {quote ? (
        <div className="mt-4" aria-live="polite">
          <p className="flex items-start gap-2 text-xs text-muted">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span>
              {quote.address ? `${addressLabel(quote.address)} · ` : ""}CEP {formatCep(quote.cep)}
            </span>
          </p>
          {onSelect ? (
            <fieldset className="mt-3 grid gap-2">
              <legend className="sr-only">Opções de entrega</legend>
              {quote.options.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex gap-3 border p-3.5 transition",
                    o.unavailableReason ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    selectedId === o.id ? "border-ink" : "border-line hover:border-ink/40",
                  )}
                >
                  <input
                    type="radio"
                    name="shipping-option"
                    value={o.id}
                    className="mt-0.5 h-4 w-4 accent-ink"
                    checked={selectedId === o.id}
                    disabled={Boolean(o.unavailableReason)}
                    onChange={() => onSelect(o)}
                  />
                  <OptionText option={o} />
                </label>
              ))}
            </fieldset>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {quote.options.map((o) => (
                <li key={o.id} className={cn("flex py-3", o.unavailableReason && "opacity-60")}>
                  <OptionText option={o} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">Valores e prazos são estimativas e serão confirmados pelo nosso atendimento no WhatsApp antes do pagamento.</p>
        </div>
      ) : null}
    </div>
  );
}

function OptionText({ option: o }: { option: ShippingOption }) {
  const details = [o.estimate && `Prazo estimado: ${o.estimate}`, o.note].filter(Boolean).join(" · ");
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{o.name}</span>
        {o.kind === "arrange" ? null : (
          <span className={cn("shrink-0 tabular-nums", o.feeCents === 0 && o.method !== "to_arrange" ? "font-semibold text-success" : o.feeCents == null || o.method === "to_arrange" ? "text-muted" : "font-semibold")}>
            {shippingFeeLabel(o)}
          </span>
        )}
      </span>
      {details ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{details}</span> : null}
      {o.unavailableReason ? <span className="mt-0.5 block text-xs text-danger">{o.unavailableReason}</span> : null}
    </span>
  );
}
