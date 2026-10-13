"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveProduct } from "@/lib/admin/actions/products";
import { productSchema, type ProductFormValues } from "@/lib/admin/schemas";
import { COMMERCIAL_STATUS_LABEL, commercialStatus, SKIN_TYPE_LABEL } from "@/lib/types";
import { cn, slugify } from "@/lib/utils";
import { Card, StatusPill } from "./ui";

type Option = { id: string; name: string; depth?: number };

export function ProductForm({
  initial,
  brands,
  productTypes,
  concerns,
  allProducts,
  stock,
}: {
  initial: ProductFormValues;
  brands: Option[];
  productTypes: Option[];
  concerns: Option[];
  allProducts: { id: string; name: string; status: string; availability: string }[];
  stock: { tracked: boolean; quantity: number | null; reserved: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const form = useForm<ProductFormValues>({ resolver: zodResolver(productSchema), defaultValues: initial, mode: "onBlur" });
  const { register, handleSubmit, formState, getValues, setValue, setError, control } = form;
  const variants = useFieldArray({ control, name: "variants" });
  // After a save the server sends fresh values (e.g. new variant ids): sync without losing feedback
  const serialized = JSON.stringify(initial);
  useEffect(() => {
    form.reset(JSON.parse(serialized));
  }, [serialized, form]);
  const errors = formState.errors;
  const trackInventory = useWatch({ control, name: "trackInventory" });
  const categoryIds = useWatch({ control, name: "categoryIds" });
  const skinTypes = useWatch({ control, name: "skinTypes" });
  const watchedVariants = useWatch({ control, name: "variants" });
  const status = useWatch({ control, name: "status" });
  const availability = useWatch({ control, name: "availability" });
  const relatedIds = useWatch({ control, name: "relatedIds" });
  const sourcingStatus = useWatch({ control, name: "sourcingStatus" });
  const regulatoryStatus = useWatch({ control, name: "regulatoryStatus" });
  const [relatedQuery, setRelatedQuery] = useState("");
  const commercial = commercialStatus(status, availability);
  const saleBlocked = sourcingStatus !== "stock_confirmed" && regulatoryStatus !== "verified";

  const onSubmit = (values: ProductFormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveProduct(values);
      if (!res.ok) {
        setMessage({ ok: false, text: res.message ?? "Não foi possível salvar." });
        Object.entries(res.errors ?? {}).forEach(([k, m]) => setError(k as keyof ProductFormValues, { message: m }));
        return;
      }
      setMessage({ ok: true, text: res.message ?? "Salvo." });
      if (!initial.id && res.id) router.push(`/admin/produtos/${res.id}?criado=1`);
      else router.refresh();
    });
  };

  const onInvalid = (e: FieldErrors<ProductFormValues>) => {
    setMessage({ ok: false, text: "Revise os campos destacados." });
    const first = Object.keys(e)[0];
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  };

  const toggleIn = (key: "categoryIds" | "skinTypes" | "relatedIds", value: string) => {
    const list = getValues(key);
    setValue(key, list.includes(value) ? list.filter((x) => x !== value) : [...list, value], { shouldDirty: true });
  };

  const err = (name: keyof ProductFormValues) => (errors[name]?.message as string | undefined) ?? null;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="grid gap-6 lg:grid-cols-[1fr_20rem]" noValidate>
      <div className="min-w-0 space-y-6">
        <Card title="Informações principais">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome comercial" htmlFor="name" error={err("name")} className="sm:col-span-2">
              <Input
                id="name"
                {...register("name", {
                  onChange: (e) => {
                    if (!slugTouched) setValue("slug", slugify(e.target.value));
                  },
                })}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <Field label="Marca" htmlFor="brandId" error={err("brandId")}>
              <Select id="brandId" {...register("brandId")} aria-invalid={Boolean(errors.brandId)}>
                <option value="">Selecione…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Linha" htmlFor="productLine" error={err("productLine")}>
              <Input id="productLine" {...register("productLine")} placeholder="Ex.: Madagascar Centella" />
            </Field>
            <Field label="Conteúdo / volume" htmlFor="volume" error={err("volume")}>
              <Input id="volume" {...register("volume")} placeholder="Ex.: 100 ml" />
            </Field>
            <Field label="URL amigável" htmlFor="slug" error={err("slug")} hint="/produtos/…">
              <Input id="slug" {...register("slug", { onChange: () => setSlugTouched(true) })} aria-invalid={Boolean(errors.slug)} />
            </Field>
            <Field label="Descrição curta" htmlFor="shortDescription" error={err("shortDescription")} className="sm:col-span-2" hint="Aparece no topo da página e nos resultados de busca.">
              <Textarea id="shortDescription" rows={3} {...register("shortDescription")} />
            </Field>
            <Field label="Descrição detalhada" htmlFor="description" error={err("description")} className="sm:col-span-2">
              <Textarea id="description" rows={6} {...register("description")} />
            </Field>
          </div>
        </Card>

        <Card title="Conteúdo técnico e cosmético" description="Use informações do fabricante. Evite promessas de cura ou resultados garantidos.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Benefícios (um por linha)" htmlFor="benefits" error={err("benefits")}>
              <Textarea id="benefits" rows={5} {...register("benefits")} />
            </Field>
            <Field label="Ativos em destaque (um por linha)" htmlFor="keyIngredients" error={err("keyIngredients")}>
              <Textarea id="keyIngredients" rows={5} {...register("keyIngredients")} />
            </Field>
            <Field label="Modo de uso" htmlFor="howToUse" error={err("howToUse")}>
              <Textarea id="howToUse" rows={5} {...register("howToUse")} />
            </Field>
            <Field label="Advertências e precauções" htmlFor="warnings" error={err("warnings")}>
              <Textarea id="warnings" rows={5} {...register("warnings")} />
            </Field>
            <Field label="Composição completa (INCI)" htmlFor="ingredientsFull" error={err("ingredientsFull")} className="sm:col-span-2">
              <Textarea id="ingredientsFull" rows={3} {...register("ingredientsFull")} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[0.8125rem] font-semibold">Tipos de pele</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {Object.entries(SKIN_TYPE_LABEL).map(([k, label]) => (
                  <Checkbox key={k} label={label} checked={skinTypes.includes(k)} onChange={() => toggleIn("skinTypes", k)} />
                ))}
              </div>
            </div>
            <Field label="Tags de busca (separadas por vírgula)" htmlFor="tags" error={err("tags")} className="sm:col-span-2" hint="Ex.: vitamina c, niacinamida, glow">
              <Input id="tags" {...register("tags")} />
            </Field>
            <Field label="Vídeo demonstrativo (opcional)" htmlFor="videoUrl" error={err("videoUrl")} className="sm:col-span-2" hint="Link do YouTube ou de um arquivo .mp4">
              <Input id="videoUrl" {...register("videoUrl")} placeholder="https://" />
            </Field>
          </div>
        </Card>

        <Card title="Categorias" description="Tipo de produto e necessidades atendidas.">
          {errors.categoryIds ? <p className="mb-3 text-xs text-danger">{errors.categoryIds.message}</p> : null}
          <div className="grid gap-6 sm:grid-cols-2">
            <CheckGroup title="Tipo de produto" options={productTypes} selected={categoryIds} onToggle={(id) => toggleIn("categoryIds", id)} />
            <CheckGroup title="Necessidades" options={concerns} selected={categoryIds} onToggle={(id) => toggleIn("categoryIds", id)} />
          </div>
        </Card>

        <Card title="Variantes" description="Opcional: tamanhos ou versões com preço e estoque próprios.">
          {variants.fields.length === 0 ? <p className="text-sm text-muted">Nenhuma variante. O produto é vendido como item único.</p> : null}
          <div className="space-y-4">
            {variants.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-6">
                <Field label="Nome" error={errors.variants?.[index]?.name?.message ?? null} className="sm:col-span-2">
                  <Input {...register(`variants.${index}.name`)} placeholder="Ex.: 50 ml" />
                </Field>
                <Field label="SKU">
                  <Input {...register(`variants.${index}.sku`)} />
                </Field>
                <Field label="Preço (R$)" error={errors.variants?.[index]?.price?.message ?? null}>
                  <Input inputMode="decimal" {...register(`variants.${index}.price`)} placeholder="Herdar" />
                </Field>
                <Field label="Preço anterior">
                  <Input inputMode="decimal" {...register(`variants.${index}.compareAtPrice`)} />
                </Field>
                <Field label="Estoque">
                  <Input inputMode="numeric" {...register(`variants.${index}.stockQuantity`)} disabled={!watchedVariants?.[index]?.trackInventory} />
                </Field>
                <div className="flex flex-wrap items-center gap-5 sm:col-span-6">
                  <Checkbox label="Controlar estoque" {...register(`variants.${index}.trackInventory`)} />
                  <Checkbox label="Ativa" {...register(`variants.${index}.isActive`)} />
                  <button type="button" onClick={() => variants.remove(index)} className="ml-auto flex items-center gap-1.5 text-xs text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 normal-case tracking-normal"
            onClick={() => variants.append({ name: "", sku: "", price: "", compareAtPrice: "", trackInventory: false, stockQuantity: "", isActive: true })}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar variante
          </Button>
        </Card>

        <Card
          title="Produtos relacionados"
          description="Opcional. Aparecem primeiro em “Você também pode gostar”. Sem seleção, as sugestões são automáticas e nunca combinam retinoides com esfoliantes."
        >
          {errors.relatedIds ? <p className="mb-3 text-xs text-danger">{errors.relatedIds.message as string}</p> : null}
          {relatedIds.length ? (
            <ol className="mb-4 flex flex-wrap gap-2">
              {relatedIds.map((rid) => (
                <li key={rid}>
                  <button type="button" onClick={() => toggleIn("relatedIds", rid)} className="rounded-full bg-ivory px-3 py-1 text-xs hover:bg-sand" title="Remover">
                    {allProducts.find((p) => p.id === rid)?.name ?? "Produto"} ×
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          <Input value={relatedQuery} onChange={(e) => setRelatedQuery(e.target.value)} placeholder="Buscar produto para relacionar…" aria-label="Buscar produto para relacionar" />
          {relatedQuery.trim().length >= 2 ? (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-line">
              {allProducts
                .filter((p) => p.id !== initial.id && !relatedIds.includes(p.id) && p.name.toLowerCase().includes(relatedQuery.trim().toLowerCase()))
                .slice(0, 12)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        toggleIn("relatedIds", p.id);
                        setRelatedQuery("");
                      }}
                      className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ivory"
                    >
                      {p.name}
                      <span className="text-xs text-muted">{p.status === "published" ? (p.availability === "coming_soon" ? "Em breve" : "Publicado") : "Rascunho"}</span>
                    </button>
                  </li>
                ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-muted">Produtos em rascunho só aparecem na loja quando forem publicados.</p>
        </Card>

        <Card title="SEO" description="Deixe em branco para usar o nome e a descrição curta.">
          <div className="grid gap-5">
            <Field label="Título para buscadores" htmlFor="seoTitle" error={err("seoTitle")} hint="Até 70 caracteres">
              <Input id="seoTitle" {...register("seoTitle")} />
            </Field>
            <Field label="Descrição para buscadores" htmlFor="seoDescription" error={err("seoDescription")} hint="Até 170 caracteres">
              <Textarea id="seoDescription" rows={2} {...register("seoDescription")} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <Card title="Publicação e disponibilidade">
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-xs text-muted">
              Situação na loja:
              <StatusPill tone={commercial === "available" ? "green" : commercial === "coming_soon" ? "blue" : commercial === "on_request" ? "dark" : commercial === "draft" ? "gray" : commercial === "archived" ? "red" : "amber"}>
                {COMMERCIAL_STATUS_LABEL[commercial]}
              </StatusPill>
            </p>
            <Field label="Visibilidade" htmlFor="status">
              <Select id="status" {...register("status")}>
                <option value="draft">Rascunho — visível só no painel</option>
                <option value="published">Publicado — visível na loja</option>
                <option value="archived">Arquivado — fora da vitrine</option>
              </Select>
            </Field>
            <Field label="Disponibilidade" htmlFor="availability" error={err("availability")}>
              <Select id="availability" {...register("availability")}>
                <option value="in_stock">Disponível para compra</option>
                <option value="coming_soon">Em breve — vitrine, sem compra</option>
                <option value="out_of_stock">Esgotado</option>
                <option value="on_request">Sob consulta — visível, preço e disponibilidade pelo WhatsApp</option>
              </Select>
            </Field>
            {availability === "coming_soon" ? (
              <Field label="Aviso público (opcional)" htmlFor="comingSoonNote" error={err("comingSoonNote")} hint="Somente informação confirmada. Ex.: Chegada prevista para dezembro.">
                <Input id="comingSoonNote" {...register("comingSoonNote")} />
              </Field>
            ) : null}
            {availability === "in_stock" && saleBlocked ? (
              <p className="rounded-md bg-warning/10 p-3 text-xs leading-relaxed text-warning">
                A venda só é liberada após registrar a documentação e a regularização como verificadas (seção “Fornecedor e regularização”).
              </p>
            ) : null}
            <Checkbox label="Destaque na home" {...register("isFeatured")} />
            <Field label="Ordem no destaque" htmlFor="featuredOrder">
              <Input id="featuredOrder" inputMode="numeric" {...register("featuredOrder")} />
            </Field>
            <Checkbox label="Marcar como novidade" {...register("isNew")} />
            <Checkbox label="Mídia pendente (aguardando fotos oficiais)" {...register("mediaPending")} />
            <Field label="Ordem no catálogo" htmlFor="sortOrder">
              <Input id="sortOrder" inputMode="numeric" {...register("sortOrder")} />
            </Field>
          </div>
        </Card>

        <Card title="Preço">
          <div className="space-y-4">
            <Field label="Preço de venda (R$)" htmlFor="price" error={err("price")} hint="Vazio = “Consultar preço”">
              <Input id="price" inputMode="decimal" {...register("price")} placeholder="0,00" />
            </Field>
            <Field label="Preço anterior (R$)" htmlFor="compareAtPrice" error={err("compareAtPrice")} hint="Somente para promoções reais">
              <Input id="compareAtPrice" inputMode="decimal" {...register("compareAtPrice")} />
            </Field>
            <Field label="Custo de aquisição (R$)" htmlFor="cost" error={err("cost")} hint="Privado — nunca exibido na loja">
              <Input id="cost" inputMode="decimal" {...register("cost")} />
            </Field>
          </div>
        </Card>

        <Card title="Estoque">
          <div className="space-y-4">
            <Checkbox label="Controlar quantidade em estoque" {...register("trackInventory")} />
            {trackInventory && stock?.tracked ? (
              <p className="rounded-md bg-ivory p-3 text-xs leading-relaxed">
                Em estoque: <strong>{stock.quantity ?? 0}</strong> · Reservado: <strong>{stock.reserved}</strong>
                <br />
                Use a página <a href="/admin/estoque" className="underline">Estoque</a> para entradas, saídas e ajustes.
              </p>
            ) : trackInventory ? (
              <Field label="Quantidade inicial" htmlFor="initialStock" error={err("initialStock")}>
                <Input id="initialStock" inputMode="numeric" {...register("initialStock")} placeholder="0" />
              </Field>
            ) : (
              <p className="text-xs text-muted">Sem controle numérico: a disponibilidade acima define se o produto pode ser comprado.</p>
            )}
            <Field label="Alerta de estoque baixo" htmlFor="lowStockThreshold" error={err("lowStockThreshold")}>
              <Input id="lowStockThreshold" inputMode="numeric" {...register("lowStockThreshold")} />
            </Field>
          </div>
        </Card>

        <Card title="Fornecedor e regularização" description="Privado — nunca exibido na loja. Requisito para liberar a venda de novos produtos.">
          <div className="space-y-4">
            <Field label="Situação de compra" htmlFor="sourcingStatus">
              <Select id="sourcingStatus" {...register("sourcingStatus")}>
                <option value="stock_confirmed">Estoque confirmado</option>
                <option value="planned">Aquisição planejada</option>
                <option value="evaluating">Em avaliação</option>
              </Select>
            </Field>
            <Field label="Documentação e regularização" htmlFor="regulatoryStatus" error={err("regulatoryStatus")}>
              <Select id="regulatoryStatus" {...register("regulatoryStatus")}>
                <option value="not_verified">Não verificada</option>
                <option value="in_progress">Em verificação</option>
                <option value="verified">Verificada</option>
              </Select>
            </Field>
            <Field label="Nº de notificação/registro (ANVISA)" htmlFor="regulatoryReference">
              <Input id="regulatoryReference" {...register("regulatoryReference")} />
            </Field>
            <Field label="Fornecedor" htmlFor="supplier">
              <Input id="supplier" {...register("supplier")} />
            </Field>
            <Field label="Documento do fornecedor (NF, invoice)" htmlFor="supplierDocument">
              <Input id="supplierDocument" {...register("supplierDocument")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lote atual" htmlFor="batchNumber">
                <Input id="batchNumber" {...register("batchNumber")} />
              </Field>
              <Field label="Validade" htmlFor="expiryDate" error={err("expiryDate")}>
                <Input id="expiryDate" type="date" {...register("expiryDate")} />
              </Field>
            </div>
            <Field label="Notas da documentação" htmlFor="documentationNotes">
              <Textarea id="documentationNotes" rows={3} {...register("documentationNotes")} />
            </Field>
          </div>
        </Card>

        <Card title="Dados internos" description="Visíveis apenas no painel.">
          <div className="space-y-4">
            <Field label="SKU" htmlFor="sku" error={err("sku")}>
              <Input id="sku" {...register("sku")} />
            </Field>
            <Field label="Código de barras" htmlFor="barcode">
              <Input id="barcode" inputMode="numeric" {...register("barcode")} />
            </Field>
            <Checkbox label="Conteúdo técnico revisado" {...register("contentVerified")} />
            <Field label="Observações internas" htmlFor="internalNotes">
              <Textarea id="internalNotes" rows={3} {...register("internalNotes")} />
            </Field>
          </div>
        </Card>

        <div className="space-y-3">
          {message ? (
            <p role={message.ok ? "status" : "alert"} className={cn("rounded-md px-3 py-2 text-sm", message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
              {message.text}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full normal-case tracking-normal" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Salvando…" : initial.id ? "Salvar alterações" : "Criar produto"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CheckGroup({ title, options, selected, onToggle }: { title: string; options: Option[]; selected: string[]; onToggle: (id: string) => void }): ReactNode {
  return (
    <div>
      <p className="mb-2 text-[0.8125rem] font-semibold">{title}</p>
      <div className="space-y-2">
        {options.map((o) => (
          <Checkbox key={o.id} label={o.name} checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} className={o.depth ? "pl-6 text-ink-soft" : "font-medium"} />
        ))}
      </div>
    </div>
  );
}
