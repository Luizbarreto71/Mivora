import { AlertCircle, Check, Clock, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { PaymentAutoRefresh, PayOrderButton, PixPayment, RenewPixButton } from "@/components/store/order/order-payment-actions";
import { buttonClasses } from "@/components/ui/button";
import { getStoreSettings } from "@/lib/catalog/queries";
import { formatBRL } from "@/lib/money";
import { syncOrderPayments, syncPayment } from "@/lib/payments/mercadopago";
import { isUuid, paymentTypeLabel, paymentWindowOpen, type PaymentStatus } from "@/lib/payments/mercadopago-core";
import { getPublicSupabase } from "@/lib/supabase/public";
import { DELIVERY_METHOD_LABEL, type DeliveryMethod } from "@/lib/types";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

const BRANDS: Record<string, string> = { master: "Mastercard", visa: "Visa", elo: "Elo", amex: "American Express", hipercard: "Hipercard" };

export const metadata: Metadata = {
  title: "Seu pedido",
  robots: { index: false, follow: false },
};

type Receipt = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  first_name: string;
  payment_method: "whatsapp" | "mercadopago";
  payment_status: PaymentStatus;
  payment_type: string | null;
  payment_installments: number | null;
  payment_brand: string | null;
  pix: { qr_code: string; qr_base64: string | null; ticket_url: string | null; expires_at: string | null } | null;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number | null;
  delivery_method: DeliveryMethod | null;
  shipping_service: string | null;
  shipping_estimate: string | null;
  shipping_city: string | null;
  shipping_uf: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
  items: { name: string; quantity: number; line_total_cents: number | null }[];
};

async function readReceipt(id: string) {
  const sb = getPublicSupabase();
  if (!sb) return null;
  const { data } = await sb.rpc("get_order_receipt", { p_order_id: id });
  return (data as Receipt | null) ?? null;
}

// The order page checks Mercado Pago at most every few seconds per order (refreshes, several tabs)
const lastCheck = new Map<string, number>();
function shouldCheck(id: string) {
  const now = Date.now();
  if (now - (lastCheck.get(id) ?? 0) < 6_000) return false;
  if (lastCheck.size > 2000) lastCheck.clear();
  lastCheck.set(id, now);
  return true;
}

async function OrderContent({ params, searchParams }: PageProps<"/pedido/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  let receipt = await readReceipt(id);
  if (!receipt) notFound();

  // Back from Mercado Pago (payment_id) or still waiting: confirm the status with the Mercado Pago API
  const awaiting = receipt.payment_method === "mercadopago" && ["pending", "in_process", "rejected", "cancelled"].includes(receipt.payment_status);
  if (awaiting && shouldCheck(id)) {
    const returned = String(query.payment_id ?? query.collection_id ?? "");
    try {
      const result = /^[0-9]{1,24}$/.test(returned) ? await syncPayment(returned, id) : await syncOrderPayments(id);
      if (result.ok && result.changed) receipt = (await readReceipt(id)) ?? receipt;
    } catch (error) {
      console.error("[pedido] consulta ao Mercado Pago falhou", (error as Error).message);
    }
  }

  const settings = await getStoreSettings();
  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);
  const helpUrl = whatsapp ? buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Gostaria de falar sobre o meu pedido ${receipt.code}.`) : null;

  const online = receipt.payment_method === "mercadopago";
  const ps = receipt.payment_status;
  const confirmed = ["confirmed", "completed"].includes(receipt.status);
  const canPay = online && ["pending", "rejected", "cancelled"].includes(ps) && !["cancelled", "completed"].includes(receipt.status) && paymentWindowOpen(receipt.created_at);
  const brand = receipt.payment_brand && receipt.payment_brand !== "pix" ? (BRANDS[receipt.payment_brand] ?? receipt.payment_brand) : null;
  const type = [paymentTypeLabel(receipt.payment_type), brand, receipt.payment_installments && receipt.payment_installments > 1 ? `em ${receipt.payment_installments}x` : null].filter(Boolean).join(" ") || null;
  const isPix = receipt.payment_brand === "pix" || receipt.payment_type === "bank_transfer";
  const pixExpired = online && isPix && ps === "pending" && !receipt.pix && canPay;
  const total = receipt.amount_due_cents ?? (receipt.delivery_fee_cents != null ? receipt.subtotal_cents - receipt.discount_cents + receipt.delivery_fee_cents : null);

  const state = !online
    ? { tone: "neutral", icon: MessageCircle, eyebrow: "Pedido registrado", text: "A confirmação de disponibilidade, a entrega e o pagamento deste pedido são combinados com a nossa equipe pelo WhatsApp." }
    : ps === "approved"
      ? {
          tone: "success",
          icon: Check,
          eyebrow: "Pagamento aprovado",
          text: confirmed
            ? `Recebemos o pagamento${receipt.amount_paid_cents ? ` de ${formatBRL(receipt.amount_paid_cents)}` : ""}${type ? ` (${type})` : ""}. Seu pedido está confirmado e vamos prepará-lo para o envio.`
            : `Recebemos o pagamento${type ? ` (${type})` : ""}. Nossa equipe vai conferir o pedido e falar com você pelo WhatsApp, se precisar.`,
        }
      : ps === "in_process"
        ? { tone: "wait", icon: Clock, eyebrow: "Pagamento em análise", text: "O Mercado Pago está analisando o pagamento. Assim que ele for aprovado, o pedido é confirmado automaticamente. Esta página se atualiza sozinha." }
        : ps === "pending"
          ? {
              tone: "wait",
              icon: Clock,
              eyebrow: "Aguardando pagamento",
              text: receipt.pix
                ? "Pague com Pix para concluir o pedido. Assim que o Mercado Pago confirmar o pagamento, esta página mostra a aprovação sozinha."
                : pixExpired
                  ? "O código Pix deste pedido expirou. Gere um novo código para pagar."
                  : canPay
                    ? "Se você já pagou com Pix, a confirmação costuma chegar em instantes; boleto pode levar até 3 dias úteis. Esta página se atualiza sozinha. Se ainda não pagou, é só continuar pelo botão abaixo."
                    : "O prazo para pagamento deste pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp.",
            }
          : ps === "rejected"
            ? { tone: "error", icon: AlertCircle, eyebrow: "Pagamento não aprovado", text: canPay ? "O pagamento foi recusado. Nenhum valor foi cobrado por esta tentativa. Você pode tentar de novo com outro cartão ou pagar com Pix." : "O pagamento foi recusado e o prazo deste pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp." }
            : ps === "cancelled"
              ? { tone: "error", icon: AlertCircle, eyebrow: "Pagamento cancelado ou expirado", text: canPay ? "O pagamento não foi concluído. Você ainda pode pagar este pedido pelo botão abaixo." : "O prazo para pagamento deste pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp." }
              : { tone: "neutral", icon: AlertCircle, eyebrow: "Pagamento devolvido", text: "O valor deste pedido foi devolvido ou contestado no Mercado Pago. Fale com a gente se tiver qualquer dúvida." };
  const Icon = state.icon;

  return (
    <div className="mx-auto max-w-2xl">
      {online && (ps === "pending" || ps === "in_process") && (canPay || ps === "in_process") ? <PaymentAutoRefresh /> : null}
      <section aria-labelledby="pedido" className="border border-line px-6 py-10 text-center sm:px-12">
        <span
          className={
            state.tone === "success"
              ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success text-paper"
              : state.tone === "error"
                ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose text-rose-ink"
                : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper"
          }
        >
          <Icon className="h-5 w-5" />
        </span>
        <p className="eyebrow mt-6">{state.eyebrow}</p>
        <h1 id="pedido" className="heading-display mt-2 text-[2rem] tabular-nums">
          {receipt.code}
        </h1>
        {receipt.first_name ? <p className="mt-1 text-sm text-muted">Pedido de {receipt.first_name}</p> : null}
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted" role="status">
          {state.text}
        </p>
        {receipt.pix && ps === "pending" ? <PixPayment qrCode={receipt.pix.qr_code} qrBase64={receipt.pix.qr_base64} ticketUrl={receipt.pix.ticket_url} expiresAt={receipt.pix.expires_at} /> : null}
        {ps === "approved" && confirmed ? (
          <div className="mx-auto mt-6 max-w-md border-t border-line pt-5 text-left text-sm">
            <p className="font-semibold">Próximos passos</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>Nossa equipe separa e embala os seus produtos.</li>
              <li>O pedido segue pela entrega escolhida{receipt.shipping_estimate ? `, com prazo estimado de ${receipt.shipping_estimate}` : ""}.</li>
              <li>Para qualquer dúvida, fale com a gente informando o código {receipt.code}.</li>
            </ol>
          </div>
        ) : null}
        <div className="mx-auto mt-8 grid max-w-sm grid-cols-[minmax(0,1fr)] gap-3">
          {pixExpired ? <RenewPixButton orderId={receipt.id} /> : null}
          {canPay && !receipt.pix ? <PayOrderButton orderId={receipt.id} label={pixExpired ? "Pagar de outra forma" : ps === "pending" ? "Pagar agora" : "Tentar pagar novamente"} /> : null}
          {online && (ps === "pending" || ps === "in_process") ? (
            <Link href={`/pedido/${receipt.id}`} className={buttonClasses("outline", "md", "w-full")}>
              Atualizar situação
            </Link>
          ) : null}
          {helpUrl ? (
            <a href={helpUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses(canPay ? "ghost" : "primary", "md", "w-full")}>
              <WhatsAppIcon className="h-4 w-4" /> Falar no WhatsApp
            </a>
          ) : null}
        </div>
        {canPay ? <p className="mt-4 text-xs text-muted">Pagamento processado pelo Mercado Pago: Pix, cartão de crédito ou boleto.</p> : null}
      </section>

      <section aria-label="Resumo do pedido" className="mt-8 bg-ivory p-6 sm:p-8">
        <p className="eyebrow mb-4 text-ink">Resumo</p>
        <ul className="divide-y divide-line/80 text-sm">
          {receipt.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-4 py-2.5">
              <span className="min-w-0">
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{item.line_total_cents == null ? "Sob consulta" : formatBRL(item.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatBRL(receipt.subtotal_cents)}</dd>
          </div>
          {receipt.discount_cents > 0 ? (
            <div className="flex justify-between text-success">
              <dt>Desconto</dt>
              <dd className="tabular-nums">- {formatBRL(receipt.discount_cents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="min-w-0">
              Entrega
              {receipt.shipping_service || receipt.delivery_method ? (
                <span className="block text-xs text-muted">
                  {[receipt.shipping_service ?? (receipt.delivery_method ? DELIVERY_METHOD_LABEL[receipt.delivery_method] : null), receipt.shipping_estimate && `prazo estimado: ${receipt.shipping_estimate}`, receipt.shipping_city && `${receipt.shipping_city}${receipt.shipping_uf ? `/${receipt.shipping_uf}` : ""}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </dt>
            <dd className="shrink-0 tabular-nums">{receipt.delivery_fee_cents == null ? "A combinar" : receipt.delivery_fee_cents === 0 ? "Grátis" : formatBRL(receipt.delivery_fee_cents)}</dd>
          </div>
          {total != null ? (
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>{online ? "Total" : "Total estimado"}</dt>
              <dd className="tabular-nums">{formatBRL(total)}</dd>
            </div>
          ) : null}
        </dl>
      </section>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted">Guarde o código do pedido. Este endereço mostra a situação atualizada sempre que você voltar.</p>
      <div className="mt-6 text-center">
        <Link href="/produtos" className="text-sm underline underline-offset-4">
          Continuar comprando
        </Link>
      </div>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/pedido/[id]">) {
  return (
    <div className="container-page py-10 sm:py-14">
      <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse bg-ivory" aria-busy="true" />}>
        <OrderContent {...props} />
      </Suspense>
    </div>
  );
}
