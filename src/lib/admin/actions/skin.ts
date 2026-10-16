"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, formBool, formNullable, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { TAGS } from "@/lib/catalog/tags";
import { ROUTINE_STEPS, ROUTINE_TIMES } from "@/lib/skin/taxonomy";

const uuid = z.uuid();

/** Recommendation profile of a product for the skin analysis (Painel → Produtos → produto → Análise de pele). */
export async function saveSkinProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const productId = formString(fd, "product_id");
  if (!uuid.safeParse(productId).success) return fail("Produto inválido.");
  const step = formString(fd, "routine_step");
  if (step && !(ROUTINE_STEPS as readonly string[]).includes(step)) return fail("Etapa da rotina inválida.");
  const time = formString(fd, "routine_time");
  if (time && !(ROUTINE_TIMES as readonly string[]).includes(time)) return fail("Horário inválido.");
  const precautions = formNullable(fd, "precautions");
  if (precautions && precautions.length > 600) return fail("As precauções devem ter até 600 caracteres.", { precautions: "Até 600 caracteres" });
  const alternative = formNullable(fd, "alternative_product_id");
  if (alternative && (!uuid.safeParse(alternative).success || alternative === productId)) return fail("Escolha outro produto como alternativa.");
  const { error } = await supabase.from("product_skin_profiles").upsert(
    {
      product_id: productId,
      recommendable: formBool(fd, "recommendable"),
      routine_step: step || null,
      routine_time: time || null,
      precautions,
      alternative_product_id: alternative,
    },
    { onConflict: "product_id" },
  );
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  return success("Análise de pele salva.");
}
