import { describe, expect, it } from "vitest";
import { PASSWORD_RULES, passwordOk, safeNext } from "@/lib/auth/password";

describe("password rules", () => {
  it("require 8+ characters, upper and lower case letters, a number and a special character", () => {
    expect(passwordOk("Rosa#Teste9")).toBe(true);
    for (const weak of ["Ros#1a", "rosa#teste9", "ROSA#TESTE9", "Rosa#Teste", "RosaTeste9", ""]) expect(passwordOk(weak), weak).toBe(false);
    // over 72 characters (the limit of the password hash used by Supabase Auth)
    expect(passwordOk(`Aa1!${"x".repeat(69)}`)).toBe(false);
    expect(PASSWORD_RULES.map((r) => r.test("abc"))).toEqual([false, false, true, false, false]);
  });

  it("accented letters count as letters, not as special characters", () => {
    expect(PASSWORD_RULES.find((r) => r.id === "special")!.test("Ação1234")).toBe(false);
    expect(passwordOk("Ação#1234")).toBe(true);
  });
});

describe("return address after signing in", () => {
  it("only keeps paths inside the store", () => {
    expect(safeNext("/finalizar?etapa=identificacao")).toBe("/finalizar?etapa=identificacao");
    for (const bad of ["https://golpe.example", "//golpe.example", "/\\golpe.example", "javascript:alert(1)", "", null, undefined]) expect(safeNext(bad), String(bad)).toBe("/minha-conta");
    expect(safeNext(null, "/")).toBe("/");
  });
});
