"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { TAGS } from "@/lib/catalog/tags";

const STATUSES = ["started", "awaiting_contact", "negotiating", "confirmed", "completed", "cancelled"] as const;

export async function changeOrderStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const parsed = z
    .object({ orderId: z.uuid(), status: z.enum(STATUSES), note: z.string().max(500) })
    .safeParse({ orderId: formData.get("orderId"), status: formData.get("status"), note: formString(formData, "note") });
  if (!parsed.success) return fail("Dados inválidos.");
  const { error } = await supabase.rpc("admin_set_order_status", { p_order_id: parsed.data.orderId, p_status: parsed.data.status, p_note: parsed.data.note || null });
  if (error) {
    if (/insufficient_stock/.test(error.message)) return fail("Estoque insuficiente para reservar/baixar os itens deste pedido. Ajuste o estoque e tente novamente.");
    return fail(dbErrorMessage(error));
  }
  // Stock and best sellers may have changed
  updateTag(TAGS.catalog);
  return success("Status atualizado.");
}

export async function saveOrderNotes(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  if (!orderId.success) return fail("Pedido inválido.");
  const { error } = await supabase
    .from("order_intents")
    .update({
      admin_notes: formString(formData, "adminNotes").slice(0, 3000) || null,
      customer_name: formString(formData, "customerName").slice(0, 120) || null,
      customer_phone: formString(formData, "customerPhone").replace(/[^0-9+() -]/g, "").slice(0, 30) || null,
    })
    .eq("id", orderId.data);
  if (error) return fail(dbErrorMessage(error));
  return success("Anotações salvas.");
}
