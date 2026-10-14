import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applePayLineItems,
  applePayMethod,
  applePayPaymentRequest,
  buildApplePayOrder,
  formatCpf,
  isAppleValidationUrl,
  isMpOrderId,
  isValidCpf,
  mapMpOrder,
} from "@/lib/payments/apple-pay-core";
import { parseNotification, parseNotificationTarget, verifyWebhookSignature } from "@/lib/payments/mercadopago-core";

describe("Apple Pay helpers", () => {
  it("validates and formats the CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("123.456.789-00")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("529982247")).toBe("529.982.247");
    expect(formatCpf("529.982.247-2599")).toBe("529.982.247-25");
  });

  it("asks Safari for Visa and Mastercard credit cards with the exact total", () => {
    expect(applePayPaymentRequest(16090, "MIVORA")).toEqual({
      countryCode: "BR",
      currencyCode: "BRL",
      supportedNetworks: ["visa", "masterCard"],
      merchantCapabilities: ["supports3DS", "supportsCredit"],
      total: { label: "MIVORA", amount: "160.90", type: "final" },
    });
    expect(applePayLineItems({ subtotalCents: 23980, discountCents: 2398, feeCents: 4100 })).toEqual([
      { label: "Produtos", amount: "239.80", type: "final" },
      { label: "Desconto", amount: "-23.98", type: "final" },
      { label: "Frete", amount: "41.00", type: "final" },
    ]);
    expect(applePayLineItems({ subtotalCents: 11990, discountCents: 0, feeCents: 0 }).map((l) => l.label)).toEqual(["Produtos", "Frete"]);
  });

  it("maps the card network and only trusts Apple's validation URLs", () => {
    expect(applePayMethod("Visa")).toEqual({ id: "visa", type: "credit_card" });
    expect(applePayMethod("MasterCard")).toEqual({ id: "master", type: "credit_card" });
    expect(applePayMethod("Amex")).toBeNull();
    expect(applePayMethod(null)).toBeNull();
    expect(isAppleValidationUrl("https://apple-pay-gateway.apple.com/paymentservices/startSession")).toBe(true);
    expect(isAppleValidationUrl("https://apple-pay-gateway-cert.apple.com/paymentservices/startSession")).toBe(true);
    expect(isAppleValidationUrl("http://apple-pay-gateway.apple.com/paymentservices/startSession")).toBe(false);
    expect(isAppleValidationUrl("https://apple-pay-gateway.apple.com.evil.example/x")).toBe(false);
    expect(isAppleValidationUrl("https://evil.example/apple-pay-gateway.apple.com")).toBe(false);
    expect(isAppleValidationUrl("nada")).toBe(false);
  });

  it("builds the Orders API payment with only the documented fields", () => {
    const body = buildApplePayOrder({
      orderId: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f",
      amountCents: 16090,
      email: "ana@example.com",
      cpf: "529.982.247-25",
      method: { id: "visa", type: "credit_card" },
      cardToken: "tok123",
    });
    expect(Object.keys(body).sort()).toEqual(["currency_id", "external_reference", "payer", "processing_mode", "total_amount", "transactions", "type"]);
    expect(body).toMatchObject({
      type: "online",
      processing_mode: "automatic",
      total_amount: "160.90",
      currency_id: "BRL",
      external_reference: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f",
      payer: { email: "ana@example.com", identification: { type: "CPF", number: "52998224725" } },
    });
    expect(body.transactions.payments).toEqual([{ amount: "160.90", payment_method: { id: "visa", type: "credit_card", token: "tok123", installments: 1 } }]);
  });

  it("translates Orders API statuses to the store's payment statuses", () => {
    const order = (status: string, status_detail: string, paymentDetail?: string) => ({
      id: "ORD01M28P44G5FG8RJPM579EH56FV",
      status,
      status_detail,
      total_paid_amount: status === "processed" ? "160.90" : "0.00",
      transactions: { payments: [{ id: "PAY01M28P44GDSD4JYTSK5SYZT6BH", status, status_detail: paymentDetail ?? status_detail }] },
    });
    expect(mapMpOrder(order("processed", "accredited"))).toEqual({ status: "approved", detail: "accredited", paidCents: 16090 });
    expect(mapMpOrder(order("failed", "failed", "rejected_by_issuer"))).toEqual({ status: "rejected", detail: "rejected_by_issuer", paidCents: 0 });
    expect(mapMpOrder(order("processing", "in_process"))?.status).toBe("in_process");
    expect(mapMpOrder(order("action_required", "waiting_payment"))?.status).toBe("pending");
    expect(mapMpOrder(order("refunded", "refunded"))?.status).toBe("refunded");
    expect(mapMpOrder(order("processed", "refunded"))?.status).toBe("refunded");
    expect(mapMpOrder(order("charged_back", "settled"))?.status).toBe("charged_back");
    expect(mapMpOrder(order("expired", "expired"))?.status).toBe("cancelled");
    expect(mapMpOrder(order("whatever", "x"))).toBeNull();
    expect(isMpOrderId("ORD01M28P44G5FG8RJPM579EH56FV")).toBe(true);
    expect(isMpOrderId("ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9")).toBe(true);
    expect(isMpOrderId("123456")).toBe(false);
  });

  it("reads order notifications and validates their signature with the lower-case id", () => {
    const query = new URLSearchParams("data.id=ORD01M28P44G5FG8RJPM579EH56FV&type=order");
    expect(parseNotificationTarget(query, { type: "order", data: { id: "ORD01M28P44G5FG8RJPM579EH56FV" } })).toEqual({ topic: "order", id: "ORD01M28P44G5FG8RJPM579EH56FV" });
    expect(parseNotification(query, null)).toBeNull();
    expect(parseNotificationTarget(new URLSearchParams("data.id=ord01m28p44g5fg8rjpm579eh56fv&type=order"), null)).toBeNull();
    expect(parseNotificationTarget(new URLSearchParams("data.id=123&type=payment"), null)).toEqual({ topic: "payment", id: "123" });

    const secret = "segredo";
    const v1 = createHmac("sha256", secret).update("id:ord01m28p44g5fg8rjpm579eh56fv;request-id:req-1;ts:1742842580164;").digest("hex");
    expect(verifyWebhookSignature({ xSignature: `ts=1742842580164,v1=${v1}`, xRequestId: "req-1", dataId: "ORD01M28P44G5FG8RJPM579EH56FV", secret })).toBe(true);
  });
});
