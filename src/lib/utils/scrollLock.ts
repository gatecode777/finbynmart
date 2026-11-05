/**
 * Stops the page behind an open menu, drawer or gallery from scrolling. Several can be open in turn (or at once), so
 * the lock is counted: the page scrolls again only when the last one lets go. Letting go removes the inline style
 * completely: leaving an empty `style=""` on <body> differs from the server's HTML and makes React report a
 * hydration mismatch the next time the page is hydrated.
 *
 * Returns the function that releases this lock.
 */
let locks = 0;
let previousOverflow = "";

export function lockBodyScroll(): () => void {
  const body = document.body;
  if (locks === 0) {
    previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks > 0) return;
    if (previousOverflow) body.style.overflow = previousOverflow;
    else body.style.removeProperty("overflow");
    if (!body.getAttribute("style")) body.removeAttribute("style");
  };
}
