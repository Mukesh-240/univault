/**
 * AFTER LOAD — run something a moment AFTER the page has finished loading (and a short pause beyond it).
 * Plain English: the alerts bell fills itself from the server and, when live updates are on, opens a live connection.
 * Neither is needed to READ the page, so they wait until the page is loaded; on a slow connection the page is
 * ready sooner and the extra downloads no longer queue in front of it. Returns a function that cancels it.
 */
export function afterLoad(fn: () => void, delayMs = 1500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => { timer = setTimeout(fn, delayMs); };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  return () => { clearTimeout(timer); window.removeEventListener("load", start); };
}
