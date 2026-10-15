"use client";

import { CreditCard, MessageCircle, QrCode, Wallet } from "lucide-react";
import type { Ref } from "react";
import type { PayMethod } from "@/lib/store/checkout-data";
import { cn } from "@/lib/utils";
import { CardBrick, type CardBrickHandle } from "./card-brick";

type Props = {
  available: Record<PayMethod, boolean>;
  blocker: string | null;
  value: PayMethod | null;
  onChange: (method: PayMethod) => void;
  error: string | null;
  maxInstallments: number;
  card: { ref: Ref<CardBrickHandle>; publicKey: string | null; amountCents: number | null; email: string };
};

const OPTIONS: { method: PayMethod; title: string; text: string; icon: typeof QrCode }[] = [
  { method: "pix", title: "Pix", text: "Aprovação na hora. O QR Code e o código copia e cola aparecem assim que você confirmar o pedido.", icon: QrCode },
  { method: "card", title: "Cartão de crédito", text: "Cartões das principais bandeiras, com o parcelamento mostrado pelo Mercado Pago ao digitar o cartão.", icon: CreditCard },
  { method: "applepay", title: "Apple Pay", text: "Confirme com Face ID ou Touch ID na revisão do pedido. Cartões de crédito Visa e Mastercard, à vista.", icon: Wallet },
  { method: "checkout_pro", title: "Boleto ou saldo no Mercado Pago", text: "Você conclui o pagamento na página segura do Mercado Pago e volta para a página do pedido.", icon: Wallet },
  { method: "whatsapp", title: "Combinar pelo WhatsApp", text: "Enviamos o pedido para a nossa equipe e combinamos pagamento e entrega com você.", icon: MessageCircle },
];

export function PaymentSection({ available, blocker, value, onChange, error, maxInstallments, card }: Props) {
  const shown = OPTIONS.filter((o) => available[o.method]);
  return (
    <section aria-labelledby="pagamento" className="space-y-5">
      <h2 id="pagamento" className="text-lg font-semibold">
        Pagamento
      </h2>
      {blocker ? <p className="border border-line bg-ivory px-4 py-3 text-sm text-ink-soft">{blocker}</p> : null}
      {shown.length === 0 ? (
        <p className="text-sm text-danger" role="alert">
          Nenhuma forma de pagamento está disponível para este pedido no momento. Fale com a gente pelos nossos canais de atendimento.
        </p>
      ) : (
        <fieldset className="grid gap-3">
          <legend className="sr-only">Forma de pagamento</legend>
          {shown.map(({ method, title, text, icon: Icon }) => {
            const selected = value === method;
            return (
              <div key={method} className={cn("border transition", selected ? "border-ink bg-paper" : "border-line hover:border-ink/40")}>
                <label className="flex cursor-pointer gap-3 p-4">
                  <input type="radio" name="pay-method" className="mt-1 h-4 w-4 accent-ink" checked={selected} onChange={() => onChange(method)} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon className={cn("h-4 w-4", selected ? "text-rose-ink" : "text-ink/60")} strokeWidth={1.75} /> {title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">{text}</span>
                  </span>
                </label>
                {selected && method === "card" && card.publicKey && card.amountCents != null ? (
                  <div className="border-t border-line px-4 pb-4">
                    <CardBrick ref={card.ref} publicKey={card.publicKey} amountCents={card.amountCents} email={card.email} maxInstallments={maxInstallments} />
                    <p className="mt-3 text-xs text-muted">Os dados do cartão são digitados no ambiente seguro do Mercado Pago. A MIVORA não recebe nem armazena o número do cartão.</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
