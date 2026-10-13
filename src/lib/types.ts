export type PublishStatus = "draft" | "published" | "archived";
export type Availability = "in_stock" | "out_of_stock" | "on_request" | "coming_soon";
export type CategoryKind = "product_type" | "concern";
export type OrderStatus = "started" | "awaiting_contact" | "negotiating" | "confirmed" | "completed" | "cancelled";
export type DeliveryMethod = "pickup" | "local_delivery" | "shipping" | "to_arrange";

export type ImageRef = { url: string; alt: string | null; width?: number | null; height?: number | null };

export type BrandRef = { id: string; slug: string; name: string };

export type Brand = BrandRef & {
  tagline: string | null;
  description: string | null;
  origin_country: string | null;
  website_url: string | null;
  logo_url: string | null;
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
};

export type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  kind: CategoryKind;
  description: string | null;
  image_url: string | null;
  is_featured: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
};

/** Fields needed to render a product card and to add it to the cart. */
export type ProductSummary = {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: BrandRef;
  volume: string | null;
  shortDescription: string | null;
  priceCents: number | null;
  compareAtCents: number | null;
  availability: Availability;
  isAvailable: boolean;
  /** Units that can be ordered when stock is tracked numerically; null = not tracked. */
  maxQuantity: number | null;
  isNew: boolean;
  isFeatured: boolean;
  image: ImageRef | null;
  hasVariants: boolean;
};

export type ProductVariant = {
  id: string;
  name: string;
  priceCents: number | null;
  compareAtCents: number | null;
  maxQuantity: number | null;
  isAvailable: boolean;
};

export type ProductDetail = ProductSummary & {
  productLine: string | null;
  comingSoonNote: string | null;
  description: string | null;
  benefits: string[];
  keyIngredients: string[];
  ingredientsFull: string | null;
  howToUse: string | null;
  warnings: string | null;
  skinTypes: string[];
  tags: string[];
  videoUrl: string | null;
  images: ImageRef[];
  variants: ProductVariant[];
  categories: Pick<Category, "id" | "slug" | "name" | "kind" | "parent_id">[];
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  faqs: { id: string; question: string; answer: string }[];
};

export type StoreSettings = {
  store_name: string;
  tagline: string | null;
  whatsapp_number: string | null;
  whatsapp_greeting: string;
  business_hours: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  legal_name: string | null;
  cnpj: string | null;
  address: string | null;
  announcement_enabled: boolean;
  announcement_text: string | null;
  announcement_href: string | null;
  delivery_summary: string | null;
  pickup_enabled: boolean;
  pickup_details: string | null;
  free_shipping_enabled: boolean;
  free_shipping_threshold_cents: number | null;
  minimum_order_cents: number | null;
  show_registered_mark: boolean;
  coming_soon_inquiry_enabled: boolean;
  welcome_offer_enabled: boolean;
  welcome_offer_percent: number;
  welcome_offer_code: string;
  about_headline: string | null;
  about_text: string | null;
  whatsapp_section_title: string | null;
  whatsapp_section_text: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

export type DeliveryZone = {
  id: string;
  name: string;
  region: string | null;
  method: DeliveryMethod;
  fee_cents: number | null;
  free_over_cents: number | null;
  min_order_cents: number | null;
  estimate: string | null;
  notes: string | null;
};

export type Banner = {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  image_desktop_url: string | null;
  image_mobile_url: string | null;
  image_alt: string | null;
};

export type RitualStep = {
  id: string;
  step_number: number;
  title: string;
  description: string | null;
  category: { slug: string; name: string } | null;
};

export type Faq = { id: string; question: string; answer: string };

export type Kit = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  compareAtCents: number | null;
  isAvailable: boolean;
  maxQuantity: number | null;
  items: { quantity: number; product: ProductSummary }[];
  seoTitle: string | null;
  seoDescription: string | null;
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  started: "Iniciado",
  awaiting_contact: "Aguardando contato",
  negotiating: "Em negociação",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = {
  pickup: "Retirada",
  local_delivery: "Entrega local",
  shipping: "Envio",
  to_arrange: "A combinar",
};

export const SKIN_TYPE_LABEL: Record<string, string> = {
  todos: "Todos os tipos de pele",
  normal: "Pele normal",
  seca: "Pele seca",
  oleosa: "Pele oleosa",
  mista: "Pele mista",
  sensivel: "Pele sensível",
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  in_stock: "Em estoque",
  out_of_stock: "Esgotado",
  on_request: "Sob consulta",
  coming_soon: "Em breve",
};

export type CommercialStatus = "draft" | "coming_soon" | "available" | "sold_out" | "archived";

/** The five explicit statuses shown to the admin, derived from visibility + availability. */
export function commercialStatus(status: PublishStatus, availability: Availability): CommercialStatus {
  if (status === "archived") return "archived";
  if (status === "draft") return "draft";
  if (availability === "coming_soon") return "coming_soon";
  if (availability === "in_stock") return "available";
  return "sold_out";
}

export const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  draft: "Rascunho",
  coming_soon: "Em breve",
  available: "Disponível",
  sold_out: "Esgotado",
  archived: "Arquivado",
};
