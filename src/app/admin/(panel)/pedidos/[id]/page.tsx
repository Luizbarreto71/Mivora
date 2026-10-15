import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { changeOrderStatus, refreshOrderPayment, saveOrderNotes } from "@/lib/admin/actions/orders";
import { requireAdmin } from "@/lib/admin/auth";
import { ORDER_STATUS_TONE } from "@/lib/admin/labels";
import { formatBRL } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, paymentTypeLabel, type PaymentStatus } from "@/lib/payments/mercadopago-core";
import { destinationLabel, formatCep } from "@/lib/shipping/cep";
import { formatCpf } from "@/lib/payments/apple-pay-core";
import { DELIVERY_METHOD_LABEL, ORDER_STATUS_LABEL, type DeliveryMethod, type OrderStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Pedido" };

const INVENTORY_LABEL = { none: "Sem movimentação de estoque", reserved: "Itens reservados no estoque", committed: "Baixa de estoque realizada" } as const;

export default async function OrderDetailPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: order }, { data: items }, { data: history }] = await Promise.all([
    supabase.from("order_intents").select("*, zone:delivery_zones(name), customer:customers(email, marketing_consent)").eq("id", id).maybeSingle(),
    supabase.from("order_intent_items").select("*").eq("order_id", id).order("sort_order"),
    supabase.from("order_status_history").select("*").eq("order_id", id).order("id", { ascending: false }),
  ]);
  if (!order) notFound();
  const status = order.status as OrderStatus;
  const phone = normalizeWhatsAppNumber(order.customer_phone);
  const zoneName = (order.zone as { name: string } | null)?.name;
  const serviceName = zoneName ?? order.shipping_service ?? null;
  const customer = order.customer as { email: string; marketing_consent: boolean } | null;
  const paymentStatus = order.payment_status as PaymentStatus;
  const paymentTone = paymentStatus === "approved" ? "green" : paymentStatus === "rejected" || paymentStatus === "cancelled" ? "red" : paymentStatus === "refunded" || paymentStatus === "charged_back" ? "amber" : "blue";

  return (
    <AdminPage
      title={`Pedido ${order.code}`}
      description={`Iniciado em ${formatDateTime(order.created_at)} · origem: ${order.source === "site" ? "site" : order.source}`}
      back={{ href: "/admin/pedidos", label: "Pedidos" }}
      actions={
        phone ? (
          <a
            href={buildWhatsAppUrl(phone, `Olá${order.customer_name ? `, ${order.customer_name}` : ""}! Aqui é da MIVORA, sobre o seu pedido ${order.code}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm text-paper"
          >
            <WhatsAppIcon className="h-4 w-4" /> Abrir conversa
          </a>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Itens">
            <Table className="-m-5 rounded-none border-0">
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Qtd.</Th>
                  <Th>Unitário</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <tr key={i.id}>
                    <Td>
                      {i.product_id ? (
                        <Link href={`/admin/produtos/${i.product_id}`} className="hover:underline">
                          {i.name_snapshot}
                        </Link>
                      ) : (
                        i.name_snapshot
                      )}
                      {i.brand_snapshot ? <p className="text-xs text-muted">{i.brand_snapshot}</p> : null}
                    </Td>
                    <Td>{i.quantity}</Td>
                    <Td className="tabular-nums">{i.unit_price_cents == null ? <span className="text-xs text-warning">Sob consulta</span> : formatBRL(i.unit_price_cents)}</Td>
                    <Td className="text-right tabular-nums">{i.line_total_cents == null ? "—" : formatBRL(i.line_total_cents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-8 space-y-1 border-t border-line pt-4 text-sm">
              <p className="flex justify-between">
                <span>Subtotal dos produtos</span>
                <strong className="tabular-nums">{formatBRL(order.subtotal_cents)}</strong>
              </p>
              {order.discount_cents > 0 ? (
                <>
                  <p className="flex justify-between text-success">
                    <span>Cupom {order.coupon_code}</span>
                    <span className="tabular-nums">- {formatBRL(order.discount_cents)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Total dos produtos</span>
                    <strong className="tabular-nums">{formatBRL(order.subtotal_cents - order.discount_cents)}</strong>
                  </p>
                  <p className="text-xs text-muted">Confirme com a cliente que esta é a primeira compra.</p>
                </>
              ) : null}
              {order.has_unpriced_items ? <p className="text-xs text-warning">Há itens com preço sob consulta (não incluídos no subtotal).</p> : null}
              <p className="flex justify-between gap-4 text-muted">
                <span>Entrega</span>
                <span className="text-right">
                  {order.delivery_method ? DELIVERY_METHOD_LABEL[order.delivery_method as DeliveryMethod] : "A combinar"}
                  {serviceName ? ` · ${serviceName}` : ""}
                  {order.delivery_fee_cents != null ? ` · ${formatBRL(order.delivery_fee_cents)}${order.payment_method === "mercadopago" ? "" : " (estimado)"}` : ""}
                  {order.shipping_estimate ? <span className="block text-xs">Prazo estimado: {order.shipping_estimate}</span> : null}
                </span>
              </p>
              {order.shipping_cep ? (
                <p className="flex justify-between gap-4 text-muted">
                  <span>Destino</span>
                  <span className="text-right">{destinationLabel({ cep: order.shipping_cep, city: order.shipping_city, uf: order.shipping_uf })}</span>
                </p>
              ) : null}
              {order.shipping_street ? (
                <div className="mt-2 rounded-md bg-ivory p-3 text-ink">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Endereço de entrega</p>
                  <p className="mt-1 font-medium">{order.shipping_recipient}</p>
                  <p>
                    {order.shipping_street}, {order.shipping_number}
                    {order.shipping_complement ? ` · ${order.shipping_complement}` : ""}
                  </p>
                  <p>
                    {order.shipping_district} · {order.shipping_city}/{order.shipping_uf} · CEP {order.shipping_cep ? formatCep(order.shipping_cep) : ""}
                  </p>
                  {order.shipping_reference ? <p className="text-muted">Referência: {order.shipping_reference}</p> : null}
                </div>
              ) : null}
              {order.customer_cpf ? (
                <p className="flex justify-between gap-4 text-muted">
                  <span>CPF</span>
                  <span className="tabular-nums">{formatCpf(order.customer_cpf)}</span>
                </p>
              ) : null}
              {order.user_id ? <p className="text-xs text-muted">Pedido feito com conta (login Google/Apple).</p> : null}
            </div>
          </Card>

          <Card
            title="Contato e anotações"
            description={
              customer ? (
                <>
                  Cadastro: <a href={`mailto:${customer.email}`} className="underline">{customer.email}</a> · {customer.marketing_consent ? "aceita novidades" : "não aceita novidades"} ·{" "}
                  <Link href={`/admin/clientes?q=${encodeURIComponent(customer.email)}`} className="underline">
                    ver cliente
                  </Link>
                </>
              ) : (
                "Pedido sem cadastro vinculado (anterior ao cadastro obrigatório ou cadastro excluído)."
              )
            }
          >
            <ActionForm action={saveOrderNotes} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Nome" htmlFor="customerName">
                <Input id="customerName" name="customerName" defaultValue={order.customer_name ?? ""} />
              </Field>
              <Field label="WhatsApp" htmlFor="customerPhone">
                <Input id="customerPhone" name="customerPhone" defaultValue={order.customer_phone ?? ""} />
              </Field>
              {order.customer_notes ? (
                <div className="sm:col-span-2">
                  <p className="text-[0.8125rem] font-semibold">Observações do cliente</p>
                  <p className="mt-1 whitespace-pre-line rounded-md bg-ivory p-3 text-sm">{order.customer_notes}</p>
                </div>
              ) : null}
              <Field label="Anotações internas" htmlFor="adminNotes" className="sm:col-span-2">
                <Textarea id="adminNotes" name="adminNotes" defaultValue={order.admin_notes ?? ""} rows={4} />
              </Field>
              <div>
                <SubmitButton variant="outline">Salvar anotações</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          {order.payment_method === "mercadopago" ? (
            <Card title="Pagamento online">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusPill tone={paymentTone}>{PAYMENT_STATUS_LABEL[paymentStatus]}</StatusPill>
                <span className="text-xs text-muted">Mercado Pago</span>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Total do pedido</dt>
                  <dd className="tabular-nums">{order.amount_due_cents != null ? formatBRL(order.amount_due_cents) : "—"}</dd>
                </div>
                {order.amount_paid_cents != null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Valor pago</dt>
                    <dd className={order.amount_due_cents != null && order.amount_paid_cents < order.amount_due_cents ? "font-semibold text-danger tabular-nums" : "tabular-nums"}>{formatBRL(order.amount_paid_cents)}</dd>
                  </div>
                ) : null}
                {order.payment_type ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Forma</dt>
                    <dd>
                      {paymentTypeLabel(order.payment_type)}
                      {order.payment_brand && order.payment_brand !== "pix" ? ` · ${order.payment_brand}` : ""}
                      {order.payment_installments && order.payment_installments > 1 ? ` · ${order.payment_installments}x` : ""}
                    </dd>
                  </div>
                ) : null}
                {order.paid_at ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Pago em</dt>
                    <dd>{formatDateTime(order.paid_at)}</dd>
                  </div>
                ) : null}
                {order.payment_id ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">ID no Mercado Pago</dt>
                    <dd className="tabular-nums">{order.payment_id}</dd>
                  </div>
                ) : null}
                {order.payment_detail ? <p className="text-xs text-muted">Detalhe: {order.payment_detail}</p> : null}
              </dl>
              <ActionForm action={refreshOrderPayment} className="mt-4">
                <input type="hidden" name="orderId" value={order.id} />
                <SubmitButton variant="outline" className="w-full" pendingLabel="Consultando…">
                  Consultar no Mercado Pago
                </SubmitButton>
              </ActionForm>
              <p className="mt-3 text-xs leading-relaxed text-muted">A situação é atualizada sozinha pelos avisos do Mercado Pago. Devoluções e contestações são feitas no painel do Mercado Pago e aparecem aqui.</p>
            </Card>
          ) : null}
          <Card title="Status">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusPill tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</StatusPill>
              <span className="text-xs text-muted">{INVENTORY_LABEL[order.inventory_state as keyof typeof INVENTORY_LABEL]}</span>
            </div>
            <ActionForm action={changeOrderStatus} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Novo status" htmlFor="status">
                <Select id="status" name="status" defaultValue={status}>
                  {Object.entries(ORDER_STATUS_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Observação (opcional)" htmlFor="note">
                <Input id="note" name="note" maxLength={500} />
              </Field>
              <SubmitButton className="w-full">Atualizar status</SubmitButton>
            </ActionForm>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              <strong>Confirmado</strong> reserva os itens com estoque controlado. <strong>Concluído</strong> registra a venda e dá baixa definitiva. <strong>Cancelado</strong> libera a reserva ou estorna a baixa.
            </p>
          </Card>

          <Card title="Histórico">
            <ol className="space-y-3 text-sm">
              {(history ?? []).map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <p>
                    {h.from_status && h.from_status !== h.to_status ? `${ORDER_STATUS_LABEL[h.from_status as OrderStatus]} → ` : ""}
                    <strong>{ORDER_STATUS_LABEL[h.to_status as OrderStatus]}</strong>
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(h.created_at)}</p>
                  {h.note ? <p className="mt-1 text-xs">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}
