import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  allocateDiscount,
  buildPreference,
  paidCents,
  parseNotification,
  preferenceItems,
  preferenceTotalCents,
  sortPayments,
  splitName,
  verifyWebhookSignature,
  type CheckoutOrder,
} from "@/lib/payments/mercadopago-core";

const order: CheckoutOrder = {
  id: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f",
  code: "MIV-000123",
  createdAt: "2026-10-14T12:00:00.000Z",
  items: [
    { ref: "MV0001", name: "Madagascar Centella Ampoule", brand: "SKIN1004", quantity: 3, unitPriceCents: 17999 },
    { ref: "MV0002", name: "Medicube PDRN Pink Peptide Serum", brand: "Medicube", quantity: 1, unitPriceCents: 15999 },
  ],
  discountCents: 0,
  shippingFeeCents: 4100,
  payer: { name: "Ana Paula Souza", email: "ana@example.com", phone: "27998765432", cep: "29055100" },
};

describe("Mercado Pago preference", () => {
  it("splits the buyer's name", () => {
    expect(splitName("  Ana  Paula Souza ")).toEqual({ first: "Ana", last: "Paula Souza" });
    expect(splitName("Ana")).toEqual({ first: "Ana", last: "" });
  });

  it("spreads a discount over the lines exactly, in proportion", () => {
    expect(allocateDiscount([53997, 15999], 6999)).toEqual([5399, 1600]);
    expect(allocateDiscount([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(allocateDiscount([100], 0)).toEqual([0]);
    const shares = allocateDiscount([1999, 2999, 4999], 999);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(999);
  });

  it("sends one item per line with id, title, description and category; discounts keep the total to the cent", () => {
    const plain = preferenceItems(order);
    expect(plain).toEqual([
      { id: "MV0001", title: "SKIN1004 Madagascar Centella Ampoule", description: "SKIN1004 · pedido MIV-000123", category_id: "fashion", quantity: 3, unit_price: 179.99, currency_id: "BRL" },
      { id: "MV0002", title: "Medicube PDRN Pink Peptide Serum", description: "Medicube · pedido MIV-000123", category_id: "fashion", quantity: 1, unit_price: 159.99, currency_id: "BRL" },
    ]);

    const discounted = preferenceItems({ ...order, discountCents: 6999 }); // 10% of 69996, rounded down
    // 53997 − 5399 = 48598 does not split by 3 → 2 × 161,99 + 1 × 162,00
    expect(discounted.map((i) => [i.id, i.quantity, i.unit_price])).toEqual([
      ["MV0001", 2, 161.99],
      ["MV0001", 1, 162],
      ["MV0002", 1, 143.99],
    ]);
    expect(preferenceTotalCents({ items: discounted })).toBe(69996 - 6999);
  });

  it("builds the Checkout Pro request: total, payer, return, notifications, expiry and installments", () => {
    const body = buildPreference({ ...order, discountCents: 6999 }, { siteUrl: "https://mivoracosmeticos.com.br", maxInstallments: 10, now: new Date("2026-10-14T12:00:30Z") });
    expect(preferenceTotalCents(body)).toBe(69996 - 6999 + 4100);
    expect(body.shipments).toEqual({ cost: 41, mode: "not_specified" });
    expect(body.payer).toEqual({ name: "Ana", surname: "Paula Souza", email: "ana@example.com", phone: { area_code: "27", number: "998765432" }, address: { zip_code: "29055100" } });
    expect(body.back_urls.success).toBe(`https://mivoracosmeticos.com.br/pedido/${order.id}`);
    expect(body.auto_return).toBe("approved");
    expect(body.notification_url).toBe("https://mivoracosmeticos.com.br/api/mercadopago/webhook?source_news=webhooks");
    expect(body.external_reference).toBe(order.id);
    expect(body.statement_descriptor).toBe("MIVORA");
    expect(body.payment_methods).toEqual({ installments: 10 });
    expect(body.expires).toBe(true);
    expect(body.expiration_date_to).toBe("2026-10-17T12:00:00.000Z"); // 72 h after the order
    expect(body.date_of_expiration).toBe(body.expiration_date_to);

    // local development: Mercado Pago rejects auto_return and cannot reach the webhook
    const local = buildPreference({ ...order, shippingFeeCents: 0, payer: { ...order.payer, phone: null, cep: null } }, { siteUrl: "http://localhost:3000", maxInstallments: 40 });
    expect(local).not.toHaveProperty("auto_return");
    expect(local).not.toHaveProperty("notification_url");
    expect(local).not.toHaveProperty("shipments");
    expect(local.payer).toEqual({ name: "Ana", surname: "Paula Souza", email: "ana@example.com" });
    expect(local.payment_methods.installments).toBe(12);
  });
});

describe("Mercado Pago notifications", () => {
  it("extracts the payment id from Webhooks and legacy IPN calls, ignoring other topics", () => {
    expect(parseNotification(new URLSearchParams("data.id=123456&type=payment"), { type: "payment", data: { id: "123456" } })).toBe("123456");
    expect(parseNotification(new URLSearchParams(""), { action: "payment.updated", type: "payment", data: { id: 98765 } })).toBe("98765");
    expect(parseNotification(new URLSearchParams("topic=payment&id=555"), null)).toBe("555");
    expect(parseNotification(new URLSearchParams("topic=merchant_order&id=555"), null)).toBeNull();
    expect(parseNotification(new URLSearchParams("type=payment&data.id=../../x"), null)).toBeNull();
  });

  it("validates the x-signature HMAC (manifest id;request-id;ts)", () => {
    const secret = "segredo-de-teste";
    const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");
    const v1 = sign("id:123456;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:1742505638683;");
    const header = `ts=1742505638683,v1=${v1}`;
    const base = { xSignature: header, xRequestId: "bb56a2f1-6aae-46ac-982e-9dcd3581d08e", dataId: "123456", secret };
    expect(verifyWebhookSignature(base)).toBe(true);
    expect(verifyWebhookSignature({ ...base, dataId: "123457" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, secret: "outro" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, xSignature: null })).toBe(false);
    expect(verifyWebhookSignature({ ...base, xSignature: "ts=1742505638683,v1=zz" })).toBe(false);
    // alphanumeric ids are compared in lower case; absent values leave the manifest
    const v1b = sign("id:abc123;ts:1;");
    expect(verifyWebhookSignature({ xSignature: `ts=1,v1=${v1b}`, xRequestId: null, dataId: "ABC123", secret })).toBe(true);
  });

  it("reads the amount paid and applies several payments oldest first", () => {
    expect(paidCents({ id: 1, status: "approved", transaction_amount: 670.97, shipping_amount: 41 }, 67097)).toBe(67097);
    expect(paidCents({ id: 1, status: "approved", transaction_amount: 629.97, shipping_amount: 41 }, 67097)).toBe(67097);
    expect(paidCents({ id: 1, status: "approved", transaction_amount: 1 }, 67097)).toBe(100);
    const sorted = sortPayments([
      { id: 2, status: "approved", date_created: "2026-10-14T12:10:00Z" },
      { id: 1, status: "rejected", date_created: "2026-10-14T12:05:00Z" },
    ]);
    expect(sorted.map((p) => p.id)).toEqual([1, 2]);
  });
});
