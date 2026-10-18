/**
 * Locks page scroll while an overlay is open and returns the unlock function.
 * The width of the scrollbar that disappears is kept as padding, so the page
 * behind does not jump sideways (this counted as layout shift when the welcome
 * screen opened on its own). Call it from useLayoutEffect so the overlay's first
 * painted frame already has the final layout.
 */
export function lockBodyScroll(): () => void {
  const { body, documentElement } = document;
  const { overflow, paddingRight } = body.style;
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  return () => {
    body.style.overflow = overflow;
    body.style.paddingRight = paddingRight;
  };
}
