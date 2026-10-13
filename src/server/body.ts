/* The Markdown a batch of notes becomes on GitHub. Pure, so it can be read and tested on its own. */

/** One note from the page, as the widget sends it. */
export type Note = {
  n: number;
  text: string;
  path: string;
  /** The page's locale, from its first path segment; "" on a site without locales. */
  locale: string;
  languages: "both" | "this";
  viewport: { w: number; h: number };
  element: {
    component?: string;
    tag: string;
    classes: string;
    text: string;
    selected?: string;
    src?: string;
    ancestors: string[];
    /** How the pin finds its element again; the preview email scrolls its pictures to it. */
    index?: number;
    scope?: "main" | "body";
    css?: string;
  };
};

/** What the review route returns about a pull request, and all the panel renders. */
export type PullView = {
  number: number;
  title: string;
  /** The raw description. */
  body: string;
  /** The agent's report rendered for editors, with the action's header and trailers removed. */
  html: string;
  state: "open" | "closed" | "merged";
  url: string;
  branch: string;
  sha: string;
  /** Whether the branch is one the agent made, and so may be shipped or discarded from the site. */
  agent: boolean;
};

export type BodyOptions = {
  /** The trigger phrase the workflow listens for. Default "@claude". */
  mention?: string;
  /** The site's locales, when its URLs start with one. Default none. */
  locales?: string[];
  /** The locale whose copy is the source the others follow. Default the first locale. */
  sourceLocale?: string;
  /** Where a page's code lives, so the agent starts in the right file. Default: no hint. */
  pageFiles?: (path: string, locale: string) => string[];
  /** The trailer after the notes. Default names AGENTS.md. */
  footer?: string;
};

const str = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length <= max;

/** The shape the widget sends; anything else is a bad request, not a crash in the body builder. */
export function isNote(v: unknown, locales: string[] = []): v is Note {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  const e = n.element as Record<string, unknown> | undefined;
  const localeOk = locales.length ? locales.includes(n.locale as string) : n.locale === "";
  return (
    str(n.text) && n.text.trim().length > 0 &&
    str(n.path, 300) && n.path.startsWith("/") &&
    localeOk &&
    (n.languages === "both" || n.languages === "this") &&
    !!n.viewport && typeof (n.viewport as { w: unknown }).w === "number" && typeof (n.viewport as { h: unknown }).h === "number" &&
    !!e && str(e.tag, 40) && str(e.classes) && str(e.text) &&
    Array.isArray(e.ancestors) && e.ancestors.every((a) => str(a, 300)) &&
    (e.component === undefined || str(e.component, 80)) && (e.selected === undefined || str(e.selected)) && (e.src === undefined || str(e.src)) &&
    (e.index === undefined || typeof e.index === "number") && (e.scope === undefined || e.scope === "main" || e.scope === "body") && (e.css === undefined || str(e.css, 600))
  );
}

/** Text from a note can never open or close an HTML comment: the markers are ours alone. */
export const plain = (s: string) => s.replace(/<!--/g, "<!- -").replace(/-->/g, "- ->");
const quote = (s: string) => `"${plain(s).replace(/\s+/g, " ").trim().slice(0, 240)}"`;

/** The issue or PR comment body: the trigger, then each note with its context, in Markdown. */
export function requestBody(notes: Note[], source: string, options: BodyOptions = {}): string {
  const mention = options.mention ?? "@claude";
  const locales = options.locales ?? [];
  const sourceLocale = options.sourceLocale ?? locales[0];
  const head =
    notes.length === 1
      ? `${mention} One note from the site, with its context below.`
      : `${mention} ${notes.length} notes from the site, numbered. Answer each number in the PR description: done, done with a note, or a question.`;
  const sections = notes.map((note) => {
    const e = note.element;
    const files = options.pageFiles?.(note.path, note.locale) ?? [];
    const lines = [
      `- Page: \`${note.path}\`${files.length ? ` (${files.map((f) => `\`${f}\``).join(", ")})` : ""}`,
      `- Component: ${e.component ? `\`${e.component}\` › ` : ""}\`${e.tag}\``,
    ];
    if (e.text) lines.push(`- Text: ${quote(e.text)}`);
    if (e.selected) lines.push(`- Selected: ${quote(e.selected)}`);
    if (e.classes) lines.push(`- Classes: \`${e.classes}\``);
    if (e.ancestors.length) lines.push(`- Ancestors: \`${e.ancestors.join(" > ")}\``);
    if (e.src) lines.push(`- Image: \`${e.src}\``);
    if (locales.length > 1) {
      const others = locales.filter((l) => l !== sourceLocale).join(", ");
      lines.push(`- Languages: ${note.languages === "both" ? `all (change the ${sourceLocale} source, then match ${others})` : `only ${note.locale}`}`);
    }
    lines.push(`- Viewport: ${note.viewport.w}×${note.viewport.h}${note.viewport.w < 1024 ? " (phone or tablet)" : " (desktop)"}`);
    // For the preview email's pictures, not for the agent: where on the page this note was.
    const locator = JSON.stringify({ component: e.component, index: e.index, scope: e.scope, css: e.css, tag: e.tag, classes: e.classes }).replace(/-->/g, "- ->");
    lines.push(`<!-- locator: ${locator} -->`);
    return `### ${note.n}. ${plain(note.text).trim()}\n\n${lines.join("\n")}`;
  });
  const footer = options.footer ?? "Rules for changes to the site are in `AGENTS.md`.";
  return `${head}\n\n${sections.join("\n\n")}\n\n---\nSent from ${source}. ${footer}`;
}
