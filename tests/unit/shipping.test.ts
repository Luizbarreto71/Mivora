import { describe, expect, it } from "vitest";
import { addressLabel, formatCep, normalizeCep, parseBrasilApiCep, parseViaCep } from "@/lib/shipping/cep";
import { buildMelhorEnvioRequest, businessDaysLabel, parseMelhorEnvioResponse, pickCarrierOptions } from "@/lib/shipping/melhor-envio";
import { formatCepRange, parseCepRangeLine, parseCepRanges, parseCities, sortShippingOptions, zoneCovers, zoneOption } from "@/lib/shipping/zones";
import type { DeliveryZone } from "@/lib/types";
import { buildOrderMessage } from "@/lib/whatsapp";

const zone = (over: Partial<DeliveryZone>): DeliveryZone => ({
  id: "z1",
  name: "Entrega local",
  region: null,
  method: "local_delivery",
  fee_cents: 1000,
  free_over_cents: null,
  min_order_cents: null,
  estimate: "1 dia útil",
  notes: null,
  cep_ranges: [],
  cities: [],
  ...over,
});

describe("CEP", () => {
  it("normalizes, formats and labels", () => {
    expect(normalizeCep("29055-100")).toBe("29055100");
    expect(normalizeCep(" 01001 000 ")).toBe("01001000");
    expect(normalizeCep("2905510")).toBeNull();
    expect(formatCep("29055100")).toBe("29055-100");
    expect(formatCep("2905")).toBe("2905");
    expect(addressLabel({ cep: "29055100", street: null, district: "Praia do Canto", city: "Vitória", uf: "ES" })).toBe("Praia do Canto · Vitória/ES");
  });

  it("parses ViaCEP and BrasilAPI answers, including 'not found'", () => {
    expect(parseViaCep("29055100", { localidade: "Vitória", uf: "es", bairro: "Praia do Canto", logradouro: "" })).toEqual({
      cep: "29055100",
      street: null,
      district: "Praia do Canto",
      city: "Vitória",
      uf: "ES",
    });
    expect(parseViaCep("99999999", { erro: "true" })).toBeNull();
    expect(parseViaCep("99999999", { erro: true })).toBeNull();
    expect(parseBrasilApiCep("01001000", { city: "São Paulo", state: "SP", neighborhood: "Sé", street: "Praça da Sé" })?.city).toBe("São Paulo");
  });
});

describe("delivery zones", () => {
  it("parses CEP ranges written in different ways", () => {
    expect(parseCepRangeLine("29000-000 a 29099-999")).toBe("29000000-29099999");
    expect(parseCepRangeLine("29000000-29099999")).toBe("29000000-29099999");
    expect(parseCepRangeLine("29000-000 até 29099-999")).toBe("29000000-29099999");
    expect(parseCepRangeLine("29055-100")).toBe("29055100-29055100");
    expect(parseCepRangeLine("290")).toBe("29000000-29099999");
    expect(parseCepRangeLine("29099-999 a 29000-000")).toBeNull();
    expect(parseCepRangeLine("centro")).toBeNull();
    expect(parseCepRanges("290\n29100-000 a 29199-999\nxyz\n290")).toEqual({ ranges: ["29000000-29099999", "29100000-29199999"], invalid: ["xyz"] });
    expect(formatCepRange("29000000-29099999")).toBe("29000-000 a 29099-999");
    expect(parseCities("Vitória/ES\nvila velha - es\nSerra\n/ES")).toEqual({ cities: ["Vitória/ES", "vila velha/ES", "Serra"], invalid: ["/ES"] });
  });

  it("covers a destination by CEP range or by city (accent and case insensitive)", () => {
    const local = zone({ cep_ranges: ["29000000-29099999"], cities: ["Vila Velha/ES", "Serra"] });
    expect(zoneCovers(local, "29055100", null)).toBe(true);
    expect(zoneCovers(local, "29100000", { city: "VILA VELHA", uf: "ES" })).toBe(true);
    expect(zoneCovers(local, "29100000", { city: "Vila Velha", uf: "SP" })).toBe(false);
    expect(zoneCovers(local, "29160000", { city: "Serra", uf: "ES" })).toBe(true);
    expect(zoneCovers(local, "01001000", { city: "São Paulo", uf: "SP" })).toBe(false);
    expect(zoneCovers(zone({}), "01001000", null)).toBe(true);
  });

  it("applies free delivery and minimum order rules", () => {
    const z = zone({ fee_cents: 1500, free_over_cents: 20000, min_order_cents: 5000 });
    expect(zoneOption(z, { subtotalCents: 30000, hasUnpricedItems: false })).toMatchObject({ feeCents: 0, unavailableReason: null });
    expect(zoneOption(z, { subtotalCents: 10000, hasUnpricedItems: false })).toMatchObject({ feeCents: 1500, note: "Grátis acima de R$ 200,00" });
    expect(zoneOption(z, { subtotalCents: 1000, hasUnpricedItems: false }).unavailableReason).toBe("Pedido mínimo de R$ 50,00 para esta opção");
    expect(zoneOption(zone({ method: "to_arrange", fee_cents: 900 }), { subtotalCents: 0, hasUnpricedItems: true }).feeCents).toBeNull();
  });
});

describe("Melhor Envio", () => {
  it("builds the request in cm / kg / BRL", () => {
    const body = buildMelhorEnvioRequest("29010000", "01001000", [
      { id: "p1", width: 11, height: 6, length: 16, weightKg: 0.3, insuranceValue: 179.99, quantity: 2 },
    ]);
    expect(body).toEqual({
      from: { postal_code: "29010000" },
      to: { postal_code: "01001000" },
      products: [{ id: "p1", width: 11, height: 6, length: 16, weight: 0.3, insurance_value: 179.99, quantity: 2 }],
      options: { receipt: false, own_hand: false },
    });
  });

  it("uses custom prices, skips errors and adds markup and preparation days", () => {
    const options = parseMelhorEnvioResponse(
      [
        { id: 1, name: "PAC", price: "25.00", custom_price: "22.40", custom_delivery_range: { min: 5, max: 7 }, company: { name: "Correios" } },
        { id: 2, name: "SEDEX", custom_price: "38.90", custom_delivery_time: 2, company: { name: "Correios" } },
        { id: 3, name: ".Package", error: "Serviço indisponível para o trecho.", company: { name: "Jadlog" } },
      ],
      { handlingDays: 1, markupPercent: 10, extraCents: 100 },
    );
    expect(options.map((o) => [o.id, o.name, o.feeCents, o.estimate])).toEqual([
      ["carrier:1", "Correios PAC", 2564, "6 a 8 dias úteis"],
      ["carrier:2", "Correios SEDEX", 4379, "3 dias úteis"],
    ]);
    expect(parseMelhorEnvioResponse({ message: "Unauthenticated." }, { handlingDays: 0, markupPercent: 0, extraCents: 0 })).toEqual([]);
    expect(businessDaysLabel(0, 1)).toBe("1 dia útil");
  });

  it("lists the fastest service plus the cheapest ones, up to the limit", () => {
    const carrier = (id: number, feeCents: number, days: number) => ({
      id: `carrier:${id}`, kind: "carrier" as const, method: "shipping" as const, name: `S${id}`, feeCents, estimate: null, note: null, unavailableReason: null, zoneId: null, serviceId: id, days,
    });
    const all = [carrier(1, 2282, 8), carrier(2, 3536, 3), carrier(3, 1469, 5), carrier(4, 1473, 3), carrier(5, 2016, 9), carrier(6, 1513, 6)];
    expect(pickCarrierOptions(all, 4).map((o) => o.id)).toEqual(["carrier:4", "carrier:3", "carrier:6", "carrier:5"]);
    expect(pickCarrierOptions(all, 0)).toHaveLength(6);
    expect(pickCarrierOptions(all.slice(0, 2), 4)).toHaveLength(2);
    const parsed = parseMelhorEnvioResponse([{ id: 9, name: "PAC", price: "20.00", delivery_range: { min: 5, max: 7 }, company: { name: "Correios" } }], { handlingDays: 1, markupPercent: 0, extraCents: 0 });
    expect(parsed[0].days).toBe(8);
  });

  it("orders options: pickup, local, carriers by price, a combinar", () => {
    const sorted = sortShippingOptions([
      { ...zoneOption(zone({ id: "a", method: "to_arrange", name: "A combinar" }), { subtotalCents: 0, hasUnpricedItems: false }) },
      { id: "carrier:2", kind: "carrier", method: "shipping", name: "SEDEX", feeCents: 3890, estimate: null, note: null, unavailableReason: null, zoneId: null, serviceId: 2 },
      { id: "carrier:1", kind: "carrier", method: "shipping", name: "PAC", feeCents: 2240, estimate: null, note: null, unavailableReason: null, zoneId: null, serviceId: 1 },
      { ...zoneOption(zone({ id: "b", method: "pickup", name: "Retirada", fee_cents: 0 }), { subtotalCents: 0, hasUnpricedItems: false }) },
    ]);
    expect(sorted.map((o) => o.name)).toEqual(["Retirada", "PAC", "SEDEX", "A combinar"]);
  });
});

describe("WhatsApp message with shipping", () => {
  it("shows the service, fee, estimate, destination and estimated total", () => {
    const msg = buildOrderMessage({
      code: "MIV-000020",
      items: [{ name: "Produto", quantity: 1, unitPriceCents: 17999, lineTotalCents: 17999 }],
      subtotalCents: 17999,
      hasUnpricedItems: false,
      delivery: { label: "Correios SEDEX", feeCents: 3890, estimate: "3 dias úteis", destination: "CEP 01001-000 (São Paulo/SP)" },
    });
    expect(msg).toContain("*Entrega:* Correios SEDEX — taxa estimada R$ 38,90 (sujeita a confirmação) — prazo estimado: 3 dias úteis — CEP 01001-000 (São Paulo/SP).");
    expect(msg).toContain("*Total estimado com entrega:* R$ 218,89");
  });

  it("keeps 'a combinar' and adds the destination when known", () => {
    const base = { code: "MIV-1", items: [{ name: "P", quantity: 1, unitPriceCents: null, lineTotalCents: null }], subtotalCents: 0, hasUnpricedItems: true };
    expect(buildOrderMessage(base)).toContain("*Entrega:* a combinar.");
    expect(buildOrderMessage({ ...base, delivery: { label: null, feeCents: null, estimate: null, destination: "CEP 29055-100 (Vitória/ES)" } })).toContain(
      "*Entrega:* a combinar — CEP 29055-100 (Vitória/ES).",
    );
    expect(buildOrderMessage(base)).not.toContain("Total estimado");
  });
});
