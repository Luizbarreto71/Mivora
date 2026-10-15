import { describe, expect, it } from "vitest";
import { buildCardPayment, buildPixPayment, mpDate, pixExpiry, type PaymentPayer } from "@/lib/payments/mercadopago-core";
import { cardRejectionMessage, EMPTY_ADDRESS, formatPhoneInput, isValidEmail, splitFullName, validateAddress, validateIdentity } from "@/lib/store/checkout-data";
import { attemptFor, EMPTY_DRAFT } from "@/lib/store/checkout-draft";

const identity = { email: "ana@exemplo.com.br", firstName: "Ana", lastName: "Souza", cpf: "529.982.247-25", phone: "(27) 99876-5432", marketing: false };
const address = { ...EMPTY_ADDRESS, recipient: "Ana Souza", cep: "01001-000", street: "Praça da Sé", number: "100", district: "Sé", city: "São Paulo", uf: "SP" };

describe("checkout data", () => {
  it("validates the buyer's data field by field", () => {
    expect(validateIdentity(identity)).toEqual({});
    expect(validateIdentity({ ...identity, email: "ana@", firstName: " ", lastName: "", cpf: "111.111.111-11", phone: "1234" })).toEqual({
      email: "Digite um e-mail válido, ex.: nome@exemplo.com.br.",
      firstName: "Informe seu primeiro nome.",
      lastName: "Informe seu sobrenome.",
      cpf: "CPF inválido. Confira os números.",
      phone: "Digite um telefone com DDD, ex.: (11) 91234-5678.",
    });
    expect(validateIdentity({ ...identity, cpf: "529.982" }).cpf).toBe("Informe seu CPF com 11 números.");
    expect(validateIdentity({ ...identity, cpf: "123.456.789-00" }).cpf).toBe("CPF inválido. Confira os números.");
  });

  it("validates the delivery address", () => {
    expect(validateAddress(address)).toEqual({});
    expect(validateAddress({ ...address, cep: "0100", number: " ", uf: "XX", recipient: "A" })).toEqual({
      cep: "Digite um CEP válido, com 8 números.",
      number: "Informe o número (ou S/N).",
      uf: "Escolha o estado.",
      recipient: "Informe quem vai receber o pedido.",
    });
    expect(validateAddress({ ...address, number: "S/N", uf: "sp" })).toEqual({});
  });

  it("masks the phone while typing and splits names", () => {
    expect(formatPhoneInput("27998765432")).toBe("(27) 99876-5432");
    expect(formatPhoneInput("2733334444")).toBe("(27) 3333-4444");
    expect(formatPhoneInput("+55 27 99876-5432")).toBe("(27) 99876-5432");
    expect(formatPhoneInput("2")).toBe("(2");
    expect(splitFullName("  Ana  Paula Souza ")).toEqual(["Ana", "Paula Souza"]);
    expect(splitFullName(null)).toEqual(["", ""]);
    expect(isValidEmail("privado123@privaterelay.appleid.com")).toBe(true);
    expect(isValidEmail("ana@exemplo")).toBe(false);
  });

  it("explains card refusals without technical codes", () => {
    expect(cardRejectionMessage("cc_rejected_insufficient_amount")).toBe("O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix.");
    expect(cardRejectionMessage("cc_rejected_bad_filled_security_code")).toMatch(/Confira os dados do cartão/);
    expect(cardRejectionMessage("algo_novo")).toBe("O pagamento com cartão não foi aprovado. Tente outro cartão ou pague com Pix.");
  });

  it("reuses the checkout attempt while nothing changes (no duplicate order), and starts a new one otherwise", () => {
    const first = attemptFor(EMPTY_DRAFT, "a");
    expect(first.changed).toBe(true);
    const draft = { ...EMPTY_DRAFT, requestId: first.requestId, requestSignature: "a" };
    expect(attemptFor(draft, "a")).toEqual({ requestId: first.requestId, changed: false });
    const other = attemptFor(draft, "b");
    expect(other.changed).toBe(true);
    expect(other.requestId).not.toBe(first.requestId);
  });
});

describe("Mercado Pago transparent checkout", () => {
  const order = { id: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f", code: "MIV-000123", items: [{ ref: "MV0001", name: "Madagascar Centella Ampoule", brand: "SKIN1004", quantity: 1, unitPriceCents: 11990 }], discountCents: 0 };
  const payer: PaymentPayer = {
    email: "ana@exemplo.com.br",
    firstName: "Ana",
    lastName: "Souza",
    cpf: "529.982.247-25",
    phone: "27998765432",
    address: { cep: "01001000", street: "Praça da Sé", number: "100", complement: "Apto 12", district: "Sé", city: "São Paulo", uf: "SP" },
  };

  it("formats dates with the Brasília offset", () => {
    expect(mpDate(new Date("2026-10-14T15:30:00.000Z"))).toBe("2026-10-14T12:30:00.000-03:00");
  });

  it("charges the card token only (never card data), with payer CPF, address and the server's total", () => {
    const body = buildCardPayment({ order, amountCents: 16090, card: { token: "tok_123", paymentMethodId: "visa", issuerId: "24", installments: 3 }, payer, siteUrl: "https://mivoracosmeticos.com.br" });
    expect(body).toMatchObject({
      transaction_amount: 160.9,
      token: "tok_123",
      installments: 3,
      payment_method_id: "visa",
      issuer_id: 24,
      external_reference: order.id,
      statement_descriptor: "MIVORA",
      notification_url: "https://mivoracosmeticos.com.br/api/mercadopago/webhook?source_news=webhooks",
      payer: { email: payer.email, first_name: "Ana", last_name: "Souza", identification: { type: "CPF", number: "52998224725" } },
    });
    expect(body.additional_info.shipments?.receiver_address).toMatchObject({ zip_code: "01001000", street_name: "Praça da Sé", street_number: "100", apartment: "Apto 12", state_name: "SP" });
    expect(body.additional_info.payer.phone).toEqual({ area_code: "27", number: "998765432" });
    expect(JSON.stringify(body)).not.toMatch(/card_number|security_code|cvv/i);
  });

  it("creates the Pix with its expiry; local sites get no notification URL", () => {
    const body = buildPixPayment({ order, amountCents: 16090, payer, siteUrl: "http://localhost:3000", expiresAt: new Date("2026-10-14T16:00:00.000Z") });
    expect(body).toMatchObject({ transaction_amount: 160.9, payment_method_id: "pix", date_of_expiration: "2026-10-14T13:00:00.000-03:00" });
    expect(body).not.toHaveProperty("notification_url");
  });

  it("keeps the Pix code for one hour, within the order's 72-hour window and never under 30 minutes", () => {
    const created = "2026-10-14T12:00:00.000Z";
    expect(pixExpiry(created, new Date("2026-10-14T12:10:00.000Z"))?.toISOString()).toBe("2026-10-14T13:10:00.000Z");
    expect(pixExpiry(created, new Date("2026-10-17T11:20:00.000Z"))?.toISOString()).toBe("2026-10-17T12:00:00.000Z");
    expect(pixExpiry(created, new Date("2026-10-17T11:40:00.000Z"))).toBeNull();
  });
});
