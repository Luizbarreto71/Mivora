/**
 * When the skin-analysis launch pop-up may open. Remembered per browser: closing it or starting an analysis keeps it
 * away for the configured interval; it opens at most once per browsing session and never in the same session as the
 * welcome intro. Without localStorage a cookie keeps the memory; without either it still opens only once per session.
 */
export const SKIN_POPUP_KEY = "mivora.skinPopup.v1";
const SESSION_KEY = "mivora.skinPopup.session";
const COOKIE = "mivora_skin_popup";
export const WELCOME_SESSION_KEY = "mivora.welcome.session";

export type PopupMemory = { dismissedAt?: number; startedAt?: number };

/** Pages where the pop-up never opens: buying, paying, the analysis itself, signing in or up and sign-in returns */
const QUIET_PATHS = ["/carrinho", "/finalizar", "/pedido/", "/analise-de-pele", "/auth/", "/minha-conta", "/entrar", "/criar-conta", "/confirmar-email", "/esqueci-senha", "/redefinir-senha"];

export function quietPath(pathname: string) {
  return QUIET_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

export function popupDue(memory: PopupMemory | null, now: number, intervalDays: number) {
  const last = Math.max(memory?.dismissedAt ?? 0, memory?.startedAt ?? 0);
  return !last || now - last >= intervalDays * 86_400_000;
}

const safe = <T>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function readCookie(): PopupMemory | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(\\d+)`));
  return match ? { dismissedAt: Number(match[1]) } : null;
}

export function readPopupMemory(): PopupMemory | null {
  const stored = safe(() => window.localStorage.getItem(SKIN_POPUP_KEY), null);
  if (stored) {
    const parsed = safe(() => JSON.parse(stored) as PopupMemory, null);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return safe(readCookie, null);
}

/** Records the interaction ("dismissed" = closed, "started" = went to the analysis) */
export function rememberPopup(kind: "dismissed" | "started", intervalDays: number, now = Date.now()) {
  const memory = { ...(readPopupMemory() ?? {}), [kind === "dismissed" ? "dismissedAt" : "startedAt"]: now };
  const saved = safe(() => {
    window.localStorage.setItem(SKIN_POPUP_KEY, JSON.stringify(memory));
    return true;
  }, false);
  if (!saved) safe(() => (document.cookie = `${COOKIE}=${now}; max-age=${intervalDays * 86_400}; path=/; samesite=lax`), undefined);
  markPopupSession();
}

export const popupShownThisSession = () => safe(() => window.sessionStorage.getItem(SESSION_KEY) === "1", false);
export const markPopupSession = () => safe(() => window.sessionStorage.setItem(SESSION_KEY, "1"), undefined);
export const welcomeShownThisSession = () => safe(() => window.sessionStorage.getItem(WELCOME_SESSION_KEY) === "1", false);
