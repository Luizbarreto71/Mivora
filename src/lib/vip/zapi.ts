import "server-only";

/**
 * Z-API (WhatsApp Web connection, not Meta's official API) for the VIP community's dedicated number.
 * Credentials come only from the server environment: ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN and,
 * when the account security token is switched on in the Z-API panel, ZAPI_CLIENT_TOKEN.
 */

// ZAPI_BASE_URL only points the local tests at their stand-in
const BASE = (process.env.ZAPI_BASE_URL?.trim() || "https://api.z-api.io/instances").replace(/\/$/, "");

function credentials() {
  const instance = process.env.ZAPI_INSTANCE_ID?.trim() ?? "";
  const token = process.env.ZAPI_INSTANCE_TOKEN?.trim() ?? "";
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim() ?? "";
  return { instance, token, clientToken };
}

export function zapiConfigured() {
  const c = credentials();
  return Boolean(c.instance && c.token);
}

type ZapiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ZapiResult<T>> {
  const c = credentials();
  if (!c.instance || !c.token) return { ok: false, error: "A Z-API não está configurada no servidor (ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN)." };
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(c.instance)}/token/${encodeURIComponent(c.token)}/${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(c.clientToken ? { "Client-Token": c.clientToken } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: unknown; message?: unknown }) | null;
    if (!res.ok || data == null || (typeof data === "object" && "error" in data && data.error)) {
      const detail = data && typeof data === "object" ? String(data.error ?? data.message ?? "") : "";
      console.error("[comunidade vip] Z-API respondeu", res.status, detail.slice(0, 200));
      return { ok: false, error: `A Z-API recusou o pedido (HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}).` };
    }
    return { ok: true, data };
  } catch (error) {
    console.error("[comunidade vip] Z-API inacessível", error instanceof Error ? error.name : "erro");
    return { ok: false, error: "Não foi possível falar com a Z-API agora." };
  }
}

/** Sends the post: photo with caption when there is a photo, otherwise text. Returns WhatsApp's message id. */
export async function sendToGroup(groupId: string, text: string, imageUrl: string | null): Promise<ZapiResult<{ messageId: string }>> {
  const res = imageUrl
    ? await call<{ messageId?: string; zaapId?: string }>("POST", "send-image", { phone: groupId, image: imageUrl, caption: text })
    : await call<{ messageId?: string; zaapId?: string }>("POST", "send-text", { phone: groupId, message: text });
  if (!res.ok) return res;
  const messageId = res.data.messageId ?? res.data.zaapId;
  if (!messageId) return { ok: false, error: "A Z-API não devolveu o código da mensagem; o envio não foi confirmado." };
  return { ok: true, data: { messageId: String(messageId) } };
}

export async function instanceStatus(): Promise<ZapiResult<{ connected: boolean; smartphoneConnected: boolean | null; detail: string | null }>> {
  const res = await call<{ connected?: boolean; smartphoneConnected?: boolean; error?: string }>("GET", "status");
  if (!res.ok) return res;
  return { ok: true, data: { connected: res.data.connected === true, smartphoneConnected: res.data.smartphoneConnected ?? null, detail: null } };
}

export type Community = { id: string; name: string; announcementGroupId: string | null };

/** The communities the number belongs to, each with its announcement group (where the posts go). */
export async function listCommunities(): Promise<ZapiResult<Community[]>> {
  const list = await call<{ id?: string; name?: string }[]>("GET", "communities");
  if (!list.ok) return list;
  const out: Community[] = [];
  for (const c of (Array.isArray(list.data) ? list.data : []).slice(0, 20)) {
    if (!c.id) continue;
    const meta = await call<{ subGroups?: { phone?: string; isGroupAnnouncement?: boolean }[] }>("GET", `communities-metadata/${encodeURIComponent(c.id)}`);
    const announcement = meta.ok ? (meta.data.subGroups ?? []).find((g) => g.isGroupAnnouncement && g.phone) : undefined;
    out.push({ id: String(c.id), name: String(c.name ?? "Comunidade sem nome"), announcementGroupId: announcement?.phone ?? null });
  }
  return { ok: true, data: out };
}
