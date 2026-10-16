/** Per-device memory of the welcome intro and the first-purchase coupon. */
const SEEN_KEY = "mivora.welcome.v1";
const COUPON_KEY = "mivora.coupon";

const safe = <T>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const welcomeSeen = () => safe(() => window.localStorage.getItem(SEEN_KEY) === "1", false);
export const markWelcomeSeen = () =>
  safe(() => {
    window.localStorage.setItem(SEEN_KEY, "1");
    // the skin-analysis pop-up waits for another session instead of following this intro
    window.sessionStorage.setItem("mivora.welcome.session", "1");
  }, undefined);

export const savedCoupon = () => safe(() => window.localStorage.getItem(COUPON_KEY) ?? "", "");
export const saveCoupon = (code: string) => safe(() => window.localStorage.setItem(COUPON_KEY, code), undefined);
export const clearCoupon = () => safe(() => window.localStorage.removeItem(COUPON_KEY), undefined);
