import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";

const slug = z
  .string()
  .trim()
  .min(2, "Informe a URL amigável.")
  .max(96)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens.");

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(parseBRLToCents(v)), "Valor inválido. Ex.: 129,90");

const optionalText = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

export const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Informe o nome da variante.").max(80),
  sku: optionalText(64),
  price: money,
  compareAtPrice: money,
  trackInventory: z.boolean(),
  stockQuantity: z.string().trim().regex(/^\d*$/, "Use números inteiros."),
  isActive: z.boolean(),
});

export const productSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Informe o nome do produto.").max(160),
    slug,
    brandId: z.string().min(1, "Selecione a marca."),
    productLine: optionalText(80),
    volume: optionalText(60),
    shortDescription: optionalText(400),
    description: optionalText(6000),
    benefits: optionalText(3000),
    keyIngredients: optionalText(2000),
    ingredientsFull: optionalText(6000),
    howToUse: optionalText(3000),
    warnings: optionalText(3000),
    skinTypes: z.array(z.string()),
    tags: optionalText(500),
    categoryIds: z.array(z.string()),
    price: money,
    compareAtPrice: money,
    cost: money,
    sku: optionalText(64),
    barcode: optionalText(64),
    supplier: optionalText(120),
    contentVerified: z.boolean(),
    internalNotes: optionalText(3000),
    status: z.enum(["draft", "published", "archived"]),
    availability: z.enum(["in_stock", "out_of_stock", "on_request", "coming_soon"]),
    comingSoonNote: optionalText(200),
    sourcingStatus: z.enum(["stock_confirmed", "planned", "evaluating"]),
    regulatoryStatus: z.enum(["not_verified", "in_progress", "verified"]),
    regulatoryReference: optionalText(120),
    supplierDocument: optionalText(120),
    batchNumber: optionalText(60),
    expiryDate: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v), "Data inválida."),
    documentationNotes: optionalText(3000),
    relatedIds: z.array(z.string()).max(12, "Escolha no máximo 12 produtos relacionados."),
    trackInventory: z.boolean(),
    initialStock: z.string().trim().regex(/^\d*$/, "Use números inteiros."),
    lowStockThreshold: z.string().trim().regex(/^\d*$/, "Use números inteiros."),
    isFeatured: z.boolean(),
    featuredOrder: z.string().trim().regex(/^-?\d*$/),
    isNew: z.boolean(),
    sortOrder: z.string().trim().regex(/^-?\d*$/),
    videoUrl: z
      .string()
      .trim()
      .refine((v) => v === "" || /^https:\/\//.test(v), "Use um link https://"),
    mediaPending: z.boolean(),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    variants: z.array(variantSchema).max(30),
  })
  .superRefine((v, ctx) => {
    const price = parseBRLToCents(v.price);
    const compare = parseBRLToCents(v.compareAtPrice);
    if (compare != null && price == null) ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "Defina o preço atual antes do preço anterior." });
    if (compare != null && price != null && compare <= price) ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "O preço anterior deve ser maior que o preço atual." });
    if (v.status === "published" && v.categoryIds.length === 0) ctx.addIssue({ code: "custom", path: ["categoryIds"], message: "Selecione ao menos uma categoria para publicar." });
    if (v.status === "published" && v.availability === "in_stock" && v.sourcingStatus !== "stock_confirmed" && v.regulatoryStatus !== "verified")
      ctx.addIssue({ code: "custom", path: ["regulatoryStatus"], message: "Para liberar a venda, marque a documentação e a regularização como verificadas." });
    if (v.id && v.relatedIds.includes(v.id)) ctx.addIssue({ code: "custom", path: ["relatedIds"], message: "Um produto não pode ser relacionado a ele mesmo." });
  });

export type ProductFormValues = z.infer<typeof productSchema>;
export type VariantFormValues = z.infer<typeof variantSchema>;
