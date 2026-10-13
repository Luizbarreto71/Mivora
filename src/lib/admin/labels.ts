import type { OrderStatus } from "@/lib/types";

export const ORDER_STATUS_TONE: Record<OrderStatus, "green" | "gray" | "amber" | "red" | "blue" | "dark"> = {
  started: "gray",
  awaiting_contact: "amber",
  negotiating: "blue",
  confirmed: "dark",
  completed: "green",
  cancelled: "red",
};

export const MOVEMENT_LABEL: Record<string, string> = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Ajuste",
  reservation: "Reserva",
  release: "Liberação",
  sale: "Venda",
  return: "Estorno",
};

export const PRODUCT_STATUS_LABEL = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" } as const;
