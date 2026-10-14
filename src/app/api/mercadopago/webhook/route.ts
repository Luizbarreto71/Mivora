import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { TAGS } from "@/lib/catalog/tags";
import { mercadoPagoConfig, syncPayment } from "@/lib/payments/mercadopago";
import { parseNotification, verifyWebhookSignature } from "@/lib/payments/mercadopago-core";

// Same payment notified several times in a row (created + updated, retries): handled once per short window
const recent = new Map<string, number>();
function seenRecently(key: string) {
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > 15_000) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

/**
 * Mercado Pago notifications (Webhooks). The body is never trusted: the payment is read again from the
 * Mercado Pago API with the store's access token. When the request is signed (x-signature), the signature
 * must match the application's secret (MERCADOPAGO_WEBHOOK_SECRET).
 */
export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const body = await request.json().catch(() => null);
  const paymentId = parseNotification(query, body);
  // other topics (merchant_order, tests without an id…) need nothing from the store
  if (!paymentId) return new NextResponse(null, { status: 200 });

  const config = mercadoPagoConfig();
  const signature = request.headers.get("x-signature");
  if (signature && config.webhookSecret) {
    const dataId = query.get("data.id") ?? ((body as { data?: { id?: unknown } } | null)?.data?.id != null ? String((body as { data: { id: unknown } }).data.id) : null);
    const valid = verifyWebhookSignature({ xSignature: signature, xRequestId: request.headers.get("x-request-id"), dataId, secret: config.webhookSecret });
    if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  // not configured yet: answer with an error so Mercado Pago tries again later
  if (!config.ready) return NextResponse.json({ error: "payments not configured" }, { status: 503 });
  if (seenRecently(paymentId)) return new NextResponse(null, { status: 200 });

  try {
    const result = await syncPayment(paymentId);
    // stock reserved by a paid order shows up in the catalogue
    if (result.ok && result.changed) revalidateTag(TAGS.catalog, "max");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    recent.delete(paymentId);
    console.error("[mercadopago] webhook", paymentId, (error as Error).message);
    return NextResponse.json({ error: "temporary failure" }, { status: 500 });
  }
}
