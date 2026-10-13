"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { TAGS } from "@/lib/catalog/tags";

const schema = z.object({
  productId: z.uuid("Selecione o produto."),
  variantId: z.uuid().nullable(),
  kind: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "Informe uma quantidade diferente de zero."),
  reason: z.string().max(300),
});

export async function recordStockMovement(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const raw = formString(formData, "item");
  const [productId, variantId] = raw.split(":");
  const parsed = schema.safeParse({
    productId,
    variantId: variantId || null,
    kind: formData.get("kind"),
    quantity: formString(formData, "quantity"),
    reason: formString(formData, "reason"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  if (v.kind !== "adjustment" && v.quantity < 0) return fail("Use números positivos para entradas e saídas.");
  const { error } = await supabase.rpc("admin_adjust_stock", {
    p_product_id: v.productId,
    p_variant_id: v.variantId,
    p_kind: v.kind,
    p_quantity: v.quantity,
    p_reason: v.reason || null,
  });
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  return success("Movimentação registrada.");
}

