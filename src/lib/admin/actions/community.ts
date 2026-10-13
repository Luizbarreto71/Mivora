"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, formBool, formInt, formNullable, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { TAGS } from "@/lib/catalog/tags";

const uuid = z.uuid();

/** Real testimonials only: publishing requires confirming the customer's authorisation. */
export async function saveTestimonial(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const authorName = formString(fd, "author_name");
  const body = formString(fd, "body");
  const ratingRaw = formString(fd, "rating");
  const rating = ratingRaw === "" ? null : Number.parseInt(ratingRaw, 10);
  const consent = formBool(fd, "consent_confirmed");
  const publish = formBool(fd, "is_published");
  if (authorName.length < 2 || authorName.length > 60) return fail("Informe o nome (ou a identificação autorizada) da cliente, com até 60 caracteres.");
  if (body.length < 10 || body.length > 400) return fail("O depoimento deve ter entre 10 e 400 caracteres.");
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return fail("A nota deve ser de 1 a 5 estrelas, ou ficar em branco.");
  if (publish && !consent) return fail("Para publicar, confirme que o depoimento é real e que a cliente autorizou a publicação.");
  const productId = formNullable(fd, "product_id");
  if (productId && !uuid.safeParse(productId).success) return fail("Produto inválido.");
  const row = {
    author_name: authorName,
    author_detail: formNullable(fd, "author_detail"),
    body,
    rating,
    product_id: productId,
    consent_confirmed: consent,
    is_published: publish,
    sort_order: formInt(fd, "sort_order"),
  };
  const { error } = id ? await supabase.from("testimonials").update(row).eq("id", id) : await supabase.from("testimonials").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success(id ? "Depoimento salvo." : "Depoimento cadastrado.");
}

export async function deleteTestimonial(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("testimonials").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success("Depoimento removido.");
}

/** Removes an e-mail from the list (e.g. when the person asks to unsubscribe). */
export async function deleteSubscriber(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  return success("E-mail removido da lista.");
}
