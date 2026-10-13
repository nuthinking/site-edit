/*
  Every string the widget and the review panel show. English ships here; other languages are
  given at runtime through the `messages` prop, keyed by locale, typed as `Messages` so the
  site's own typecheck proves each language complete:

    <SiteEdit messages={{ es: { ship: "Publicar", ... }, fr: { ... } }} />

  Which language shows, in order: the `uiLocale` prop; the page's locale when the site has
  locales and a language was given for it; the browser's languages; English. A language given
  with some keys missing falls back to English for those. Plurals and numbers are functions, so
  each language keeps its own rules. Keep the tone of the source: short, plain, no exclamation marks.
*/
export type Messages = {
  /* gestures and empty states */
  hintDesktop: string;
  hintPhone: string;
  signInNeeded: string;
  signIn: string;
  cancel: string;
  /* boxes */
  titleSignIn: string;
  titleNote: string;
  titleNewNote: string;
  titleEditNote: string;
  titleNotes: string;
  page: string;
  placeholder: string;
  allLanguages: string;
  add: string;
  save: string;
  edit: string;
  delete: string;
  deleteNote: string;
  /* tray */
  notes: (n: number) => string;
  send: (n: number) => string;
  sending: string;
  sent: string;
  followOnGitHub: string;
  sendFailed: string;
  exit: string;
  logOut: string;
  /* review panel */
  noPull: (pr: string | number) => string;
  githubSilent: string;
  signInToReview: string;
  loading: string;
  onGitHub: string;
  stateOpen: string;
  stateMerged: string;
  stateClosed: string;
  shipped: string;
  discarded: string;
  confirmShip: string;
  confirmDiscard: string;
  working: string;
  yesShip: string;
  yesDiscard: string;
  no: string;
  ship: string;
  shipping: string;
  discard: string;
  notAgentBranch: string;
  moved: string;
  mergeFailed: string;
  closeFailed: string;
  noConnection: string;
};

export const en: Messages = {
  hintDesktop: "Alt+right-click, or press and hold, on anything to add a note.",
  hintPhone: "Press and hold on anything to add a note.",
  signInNeeded: "Editing this site needs write access to its repository.",
  signIn: "Sign in with GitHub",
  cancel: "Cancel",
  titleSignIn: "Sign in",
  titleNote: "Note",
  titleNewNote: "New note",
  titleEditNote: "Edit note",
  titleNotes: "Notes",
  page: "page",
  placeholder: "What should change here?",
  allLanguages: "All languages",
  add: "Add",
  save: "Save",
  edit: "Edit",
  delete: "Delete",
  deleteNote: "Delete note",
  notes: (n) => (n === 0 ? "Notes" : n === 1 ? "1 note" : `${n} notes`),
  send: (n) => (n ? `Send ${n}` : "Send"),
  sending: "Sending…",
  sent: "Sent.",
  followOnGitHub: "Follow it on GitHub",
  sendFailed: "Could not send. Try again.",
  exit: "Exit",
  logOut: "Log out",
  noPull: (pr) => `No pull request #${pr}.`,
  githubSilent: "GitHub did not answer. Try again in a moment.",
  signInToReview: "to review this change.",
  loading: "Loading…",
  onGitHub: "On GitHub",
  stateOpen: "open",
  stateMerged: "merged",
  stateClosed: "closed",
  shipped: "Shipped. The live site updates in a couple of minutes.",
  discarded: "Discarded. The request stays open for another attempt.",
  confirmShip: "Merge to the live site?",
  confirmDiscard: "Close without merging?",
  working: "Working…",
  yesShip: "Yes, ship",
  yesDiscard: "Yes, discard",
  no: "No",
  ship: "Ship",
  shipping: "Shipping…",
  discard: "Discard",
  notAgentBranch: "Not an agent branch; merge it on GitHub.",
  moved: "The branch changed since you looked. Reload the preview, look again, then ship.",
  mergeFailed: "GitHub could not merge it. See the PR on GitHub for why.",
  closeFailed: "GitHub could not close it. Try again, or close it on GitHub.",
  noConnection: "No connection. Try again.",
};

/** Languages given at runtime, keyed by locale (a primary tag, or a full tag such as "pt-BR"). */
export type Languages = Record<string, Partial<Messages>>;

/** The first candidate among the given languages (or English), matching the full tag, then its primary tag. */
export function pickLocale(candidates: (string | undefined | null)[], languages: Languages = {}): string {
  const known = new Set(["en", ...Object.keys(languages).map((k) => k.toLowerCase())]);
  for (const c of candidates) {
    const full = c?.toLowerCase().replace("_", "-");
    if (!full) continue;
    if (known.has(full)) return full;
    const primary = full.split("-")[0];
    if (known.has(primary)) return primary;
  }
  return "en";
}

/** The browser's preferred languages, when there is a browser. */
export const browserLocales = (): string[] => (typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language].filter(Boolean));

/** The strings for a locale: the given language over English, so a missing key still reads. */
export function resolveMessages(locale: string, languages: Languages = {}): Messages {
  const key = Object.keys(languages).find((k) => k.toLowerCase() === locale);
  return key ? { ...en, ...languages[key] } : en;
}
