"use client";

import { Loader2, MapPin } from "lucide-react";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { formatBRL } from "@/lib/money";
import { formatCep } from "@/lib/shipping/cep";
import type { ShippingOption, ShippingQuote } from "@/lib/shipping/types";
import type { Account, AccountAddress } from "@/lib/store/account-actions";
import { UFS, type AddressField, type CheckoutAddress } from "@/lib/store/checkout-data";
import { DELIVERY_METHOD_LABEL, type DeliveryZone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shippingFeeLabel } from "../shipping-calculator";

const FIND_CEP_URL = "https://buscacepinter.correios.com.br/app/endereco/index.php";

type Props = {
  account: Account | null | undefined;
  address: CheckoutAddress;
  onAddress: (patch: Partial<CheckoutAddress>) => void;
  errors: Partial<Record<AddressField, string>>;
  addressId: string | null;
  onSelectSaved: (address: AccountAddress | null) => void;
  saveAddress: boolean;
  onSaveAddress: (value: boolean) => void;
  quote: ShippingQuote | null;
  quoting: boolean;
  quoteError: string | null;
  onLookup: (cep: string) => void;
  optionId: string | null;
  onOption: (option: ShippingOption) => void;
  optionError: string | null;
  calculatorEnabled: boolean;
  zones: DeliveryZone[];
  zoneId: string | null;
  onZone: (id: string) => void;
  needsAddress: boolean;
  pickupDetails: string | null;
};

function savedLine(a: AccountAddress) {
  return `${a.street}, ${a.number}${a.complement ? ` · ${a.complement}` : ""} · ${a.district} · ${a.city}/${a.uf} · CEP ${formatCep(a.cep)}`;
}

export function DeliverySection(p: Props) {
  const saved = p.account?.addresses ?? [];
  const usingSaved = Boolean(p.addressId && saved.some((a) => a.id === p.addressId));
  const cepDigits = p.address.cep.replace(/\D/g, "");
  const showFields = !usingSaved && (p.calculatorEnabled ? cepDigits.length === 8 || Boolean(p.address.street) : p.needsAddress);
  const showAddress = p.calculatorEnabled || p.needsAddress;

  return (
    <section aria-labelledby="entrega" className="space-y-5">
      <h2 id="entrega" className="text-lg font-semibold">
        Entrega
      </h2>

      {saved.length > 0 ? (
        <fieldset className="grid gap-2.5">
          <legend className="mb-2 text-[0.8125rem] font-semibold">Endereços salvos</legend>
          {saved.map((a) => (
            <label key={a.id} className={cn("flex cursor-pointer gap-3 border p-4 text-sm transition", p.addressId === a.id ? "border-ink" : "border-line hover:border-ink/40")}>
              <input type="radio" name="saved-address" className="mt-0.5 h-4 w-4 accent-ink" checked={p.addressId === a.id} onChange={() => p.onSelectSaved(a)} />
              <span className="min-w-0">
                <span className="font-semibold">{a.recipient}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{savedLine(a)}</span>
              </span>
            </label>
          ))}
          <label className={cn("flex cursor-pointer gap-3 border p-4 text-sm transition", !usingSaved ? "border-ink" : "border-line hover:border-ink/40")}>
            <input type="radio" name="saved-address" className="mt-0.5 h-4 w-4 accent-ink" checked={!usingSaved} onChange={() => p.onSelectSaved(null)} />
            <span className="font-semibold">Usar outro endereço</span>
          </label>
        </fieldset>
      ) : null}

      {!p.calculatorEnabled ? zonesBlock(p) : null}

      {!usingSaved && showAddress ? (
        <div className="space-y-4">
          <div>
            <Field label="CEP" htmlFor="co-cep" error={p.errors.cep ?? p.quoteError}>
              <div className="flex gap-2">
                <Input
                  id="co-cep"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  maxLength={9}
                  value={p.address.cep}
                  onChange={(e) => {
                    const cep = formatCep(e.target.value);
                    p.onAddress({ cep });
                    if (p.calculatorEnabled && cep.replace(/\D/g, "").length === 8) p.onLookup(cep);
                  }}
                  aria-invalid={p.errors.cep || p.quoteError ? true : undefined}
                  className="min-w-0 flex-1 tracking-[0.06em]"
                />
                {p.calculatorEnabled ? (
                  <button
                    type="button"
                    onClick={() => p.onLookup(p.address.cep)}
                    disabled={p.quoting}
                    className="flex h-11 min-w-[6.5rem] shrink-0 items-center justify-center border border-ink px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition hover:bg-ink hover:text-paper disabled:opacity-60"
                  >
                    {p.quoting ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Consultando" /> : "Buscar"}
                  </button>
                ) : null}
              </div>
            </Field>
            <a href={FIND_CEP_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-muted underline underline-offset-2 hover:text-ink">
              Não sei meu CEP
            </a>
          </div>

          {p.quote?.address ? (
            <p className="flex items-start gap-2 text-xs text-muted">
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-rose-ink" strokeWidth={1.5} />
              <span>
                Endereço identificado: {[p.quote.address.street, p.quote.address.district, p.quote.address.city && `${p.quote.address.city}/${p.quote.address.uf ?? ""}`].filter(Boolean).join(" · ")}
              </span>
            </p>
          ) : null}

          {showFields ? (
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Rua" htmlFor="co-street" error={p.errors.street} className="sm:col-span-4">
                <Input
                  id="co-street"
                  autoComplete="address-line1"
                  value={p.address.street}
                  onChange={(e) => p.onAddress({ street: e.target.value })}
                  aria-invalid={p.errors.street ? true : undefined}
                  maxLength={120}
                />
              </Field>
              <Field label="Número" htmlFor="co-number" error={p.errors.number} className="sm:col-span-2">
                <Input
                  id="co-number"
                  inputMode="text"
                  autoComplete="address-line2"
                  value={p.address.number}
                  onChange={(e) => p.onAddress({ number: e.target.value })}
                  aria-invalid={p.errors.number ? true : undefined}
                  maxLength={20}
                  placeholder="Ex.: 120 ou S/N"
                />
              </Field>
              <Field label="Complemento (opcional)" htmlFor="co-complement" error={p.errors.complement} className="sm:col-span-3">
                <Input id="co-complement" value={p.address.complement} onChange={(e) => p.onAddress({ complement: e.target.value })} maxLength={80} placeholder="Apto, bloco, casa" />
              </Field>
              <Field label="Referência (opcional)" htmlFor="co-reference" error={p.errors.reference} className="sm:col-span-3">
                <Input id="co-reference" value={p.address.reference} onChange={(e) => p.onAddress({ reference: e.target.value })} maxLength={120} placeholder="Perto de…" />
              </Field>
              <Field label="Bairro" htmlFor="co-district" error={p.errors.district} className="sm:col-span-2">
                <Input id="co-district" value={p.address.district} onChange={(e) => p.onAddress({ district: e.target.value })} aria-invalid={p.errors.district ? true : undefined} maxLength={80} />
              </Field>
              <Field label="Cidade" htmlFor="co-city" error={p.errors.city} className="sm:col-span-3">
                <Input
                  id="co-city"
                  autoComplete="address-level2"
                  value={p.address.city}
                  onChange={(e) => p.onAddress({ city: e.target.value })}
                  aria-invalid={p.errors.city ? true : undefined}
                  maxLength={80}
                />
              </Field>
              <Field label="Estado" htmlFor="co-uf" error={p.errors.uf} className="sm:col-span-1">
                <Select id="co-uf" autoComplete="address-level1" value={p.address.uf} onChange={(e) => p.onAddress({ uf: e.target.value })} aria-invalid={p.errors.uf ? true : undefined}>
                  <option value="">UF</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nome de quem vai receber" htmlFor="co-recipient" error={p.errors.recipient} className="sm:col-span-6">
                <Input
                  id="co-recipient"
                  autoComplete="name"
                  value={p.address.recipient}
                  onChange={(e) => p.onAddress({ recipient: e.target.value })}
                  aria-invalid={p.errors.recipient ? true : undefined}
                  maxLength={120}
                />
              </Field>
              {p.account ? <Checkbox className="sm:col-span-6" label="Salvar este endereço na minha conta" checked={p.saveAddress} onChange={(e) => p.onSaveAddress(e.target.checked)} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {p.calculatorEnabled ? (
        p.quote ? (
          <fieldset className="grid gap-2.5">
            <legend className="mb-2 text-[0.8125rem] font-semibold">Opções de entrega</legend>
            {p.quote.options.map((o) => (
              <label
                key={o.id}
                className={cn(
                  "flex gap-3 border p-4 text-sm transition",
                  o.unavailableReason ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  p.optionId === o.id ? "border-ink" : "border-line hover:border-ink/40",
                )}
              >
                <input type="radio" name="shipping-option" className="mt-0.5 h-4 w-4 accent-ink" checked={p.optionId === o.id} disabled={Boolean(o.unavailableReason)} onChange={() => p.onOption(o)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{o.name}</span>
                    {o.kind === "arrange" ? null : (
                      <span className={cn("shrink-0 tabular-nums", o.feeCents === 0 && o.method !== "to_arrange" ? "font-semibold text-success" : "font-semibold")}>{shippingFeeLabel(o)}</span>
                    )}
                  </span>
                  {[o.estimate && `Prazo estimado: ${o.estimate}`, o.note].filter(Boolean).length ? (
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{[o.estimate && `Prazo estimado: ${o.estimate}`, o.note].filter(Boolean).join(" · ")}</span>
                  ) : null}
                  {o.unavailableReason ? <span className="mt-0.5 block text-xs text-danger">{o.unavailableReason}</span> : null}
                </span>
              </label>
            ))}
            {p.optionError ? (
              <p className="text-xs text-danger" role="alert">
                {p.optionError}
              </p>
            ) : null}
            {p.pickupDetails && p.quote.options.some((o) => o.method === "pickup") ? <p className="text-xs text-muted">Retirada: {p.pickupDetails}</p> : null}
            <p className="text-xs leading-relaxed text-muted">Os prazos são estimativas e começam a contar após a confirmação do pagamento.</p>
          </fieldset>
        ) : null
      ) : null}
    </section>
  );
}

function zonesBlock(p: Props) {
  if (p.zones.length === 0) return null;
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2 text-[0.8125rem] font-semibold">Opções de entrega</legend>
      {p.zones.map((z) => (
        <label key={z.id} className={cn("flex cursor-pointer gap-3 border p-4 text-sm transition", p.zoneId === z.id ? "border-ink" : "border-line hover:border-ink/40")}>
          <input type="radio" name="zone" className="mt-0.5 h-4 w-4 accent-ink" checked={p.zoneId === z.id} onChange={() => p.onZone(z.id)} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{z.name}</span>
              <span className="text-xs text-muted">{z.method === "to_arrange" ? "A combinar" : z.fee_cents == null ? "Valor a combinar" : z.fee_cents === 0 ? "Grátis" : formatBRL(z.fee_cents)}</span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              {[DELIVERY_METHOD_LABEL[z.method], z.region, z.estimate && `Prazo estimado: ${z.estimate}`].filter(Boolean).join(" · ")}
            </span>
          </span>
        </label>
      ))}
      {p.optionError ? (
        <p className="text-xs text-danger" role="alert">
          {p.optionError}
        </p>
      ) : null}
    </fieldset>
  );
}
