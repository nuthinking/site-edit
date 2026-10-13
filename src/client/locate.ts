/*
  Describing and refinding elements for the pins. Nothing here reads React; it records what is
  searchable in the source: the component name from `data-component`, the class string, the text,
  and a CSS path for putting the pin back after navigation or a reload.
*/
export type Described = {
  component?: string;
  tag: string;
  classes: string;
  text: string;
  selected?: string;
  src?: string;
  ancestors: string[];
  /** Which same-named component root, when a page repeats one (the third card). */
  index?: number;
  /** The root the path starts from when there is no component: main, or body for what sits outside it. */
  scope?: "main" | "body";
  /** CSS path from the root to the element, for re-anchoring. */
  css: string;
};

const INLINE = new Set(["SPAN", "STRONG", "EM", "B", "I", "SMALL", "SUP", "SUB"]);
export const UI = "[data-site-edit]";

function root(el: Element): Element {
  const main = document.querySelector("main");
  return el.closest("[data-component]") ?? (main?.contains(el) ? main : document.body);
}

function step(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag;
}

function pathFrom(base: Element, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== base) {
    parts.unshift(step(cur));
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

function brief(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const name = el.getAttribute("data-component");
  return `${name ? `[${name}]` : el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
}

/** The element a gesture means: climbs out of inline wrappers like accent spans in headlines. */
export function target(node: EventTarget | null): Element | null {
  let el = node instanceof Element ? node : null;
  if (!el || el.closest(UI)) return null;
  while (el.parentElement && INLINE.has(el.tagName) && !el.getAttribute("data-component")) el = el.parentElement;
  return el;
}

export function describe(el: Element): Described {
  const base = root(el);
  const ancestors: string[] = [];
  let cur = el.parentElement;
  while (cur && ancestors.length < 4 && cur.tagName !== "MAIN" && cur.tagName !== "BODY") {
    ancestors.unshift(brief(cur));
    cur = cur.parentElement;
  }
  const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
  const img = el instanceof HTMLImageElement ? el : el.querySelector("img");
  const text = (el instanceof HTMLElement ? el.innerText : (el.textContent ?? "")).replace(/\s+/g, " ").trim().slice(0, 240);
  const component = base.getAttribute("data-component") ?? undefined;
  return {
    component,
    index: component ? Array.from(document.querySelectorAll(`[data-component="${component}"]`)).indexOf(base) : undefined,
    scope: component ? undefined : base.tagName === "MAIN" ? "main" : "body",
    tag: el.tagName.toLowerCase(),
    classes: (el.getAttribute("class") ?? "").trim(),
    text,
    selected: selection && selection.length <= 240 && text.includes(selection) ? selection : undefined,
    src: img?.getAttribute("src")?.replace(/^.*\/_next\/static\/media\//, "/_next/static/media/") ?? undefined,
    ancestors,
    css: pathFrom(base, el),
  };
}

/** Finds the element again on a later render, or null when it no longer exists. */
export function find(d: Pick<Described, "component" | "index" | "scope" | "css">): Element | null {
  const base = d.component ? document.querySelectorAll(`[data-component="${d.component}"]`)[d.index ?? 0] : d.scope === "body" ? document.body : document.querySelector("main");
  if (!base) return null;
  if (!d.css) return base;
  try {
    return base.querySelector(`:scope > ${d.css}`);
  } catch {
    return null;
  }
}
