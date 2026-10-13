export const SORT_OPTIONS = [
  { value: "destaques", label: "Destaques" },
  { value: "novidades", label: "Mais recentes" },
  { value: "preco-asc", label: "Menor preço" },
  { value: "preco-desc", label: "Maior preço" },
  { value: "az", label: "Nome (A–Z)" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const AVAILABILITY_FILTERS = [
  { value: "disponivel", label: "Disponíveis para compra" },
  { value: "sob-consulta", label: "Sob consulta" },
  { value: "em-breve", label: "Em breve" },
] as const;

export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number]["value"];

export type CatalogFilters = {
  q?: string;
  marca?: string[];
  categoria?: string[];
  necessidade?: string[];
  pele?: string;
  disponibilidade?: AvailabilityFilter;
  /** Flagged as new by the admin or published recently */
  novidades?: boolean;
  min?: number;
  max?: number;
  ordem?: SortValue;
  pagina?: number;
  /** Merchandising collections used by dedicated pages */
  colecao?: "ofertas" | "destaques";
};

export const PAGE_SIZE = 24;
/** Products published within this window count as "Novidades". */
export const NEW_ARRIVAL_DAYS = 45;

type RawParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? v.split(",") : [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{1,96}$/.test(s))
    .slice(0, 20);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const num = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseCatalogParams(params: RawParams): CatalogFilters {
  const ordem = first(params.ordem);
  const q = first(params.q)?.trim().slice(0, 80);
  const pagina = Math.max(1, Math.min(500, Math.floor(num(params.pagina) ?? 1)));
  const disp = first(params.disponibilidade) ?? (first(params.disponivel) === "1" ? "disponivel" : undefined);
  return {
    q: q || undefined,
    marca: list(params.marca),
    categoria: list(params.categoria),
    necessidade: list(params.necessidade),
    pele: list(params.pele)[0],
    disponibilidade: AVAILABILITY_FILTERS.some((o) => o.value === disp) ? (disp as AvailabilityFilter) : undefined,
    novidades: first(params.novidades) === "1" || undefined,
    min: num(params.min),
    max: num(params.max),
    ordem: SORT_OPTIONS.some((o) => o.value === ordem) ? (ordem as SortValue) : undefined,
    pagina,
  };
}

/** Builds a catalogue query string, dropping empty values. */
export function catalogQueryString(filters: CatalogFilters) {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.marca?.length) sp.set("marca", filters.marca.join(","));
  if (filters.categoria?.length) sp.set("categoria", filters.categoria.join(","));
  if (filters.necessidade?.length) sp.set("necessidade", filters.necessidade.join(","));
  if (filters.pele) sp.set("pele", filters.pele);
  if (filters.disponibilidade) sp.set("disponibilidade", filters.disponibilidade);
  if (filters.novidades) sp.set("novidades", "1");
  if (filters.min != null) sp.set("min", String(filters.min));
  if (filters.max != null) sp.set("max", String(filters.max));
  if (filters.ordem && filters.ordem !== "destaques") sp.set("ordem", filters.ordem);
  if (filters.pagina && filters.pagina > 1) sp.set("pagina", String(filters.pagina));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: CatalogFilters) {
  return Boolean(
    f.q || f.marca?.length || f.categoria?.length || f.necessidade?.length || f.pele || f.disponibilidade || f.novidades || f.min != null || f.max != null,
  );
}
