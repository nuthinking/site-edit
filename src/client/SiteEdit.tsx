import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { describe, find, target, type Described } from "./locate";
import { browserLocales, pickLocale, resolveMessages, type Languages } from "./messages";
import { Panel, Presence } from "./Panel";
import { ReviewPanel } from "./ReviewPanel";
import { ensureStyles } from "./styles";

/*
  The in-page editor. Alt+right-click (desktop) or, in comment mode, a one-finger hold (touch)
  drops a numbered pin on an element and opens a note; a two-finger hold enters comment mode.
  Without a session, the same gestures offer GitHub sign-in instead. Notes and comment mode live in
  localStorage, keyed by deployment, so they survive navigation and reloads. Send posts the batch
  to <basePath>/request, which opens a GitHub issue (or comments on the PR this preview belongs
  to). The UI only appears when the session's `<cookiePrefix>-ui` cookie is present.
*/
export type SiteEditProps = {
  /** Where the server handlers are mounted. Default "/api/site-edit". */
  basePath?: string;
  /** The pull request this deployment previews, when it does (Vercel: NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID). */
  pr?: string;
  /** The branch deployed (Vercel: NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF). Keys the stored notes. */
  branch?: string;
  /** The site's locales when its URLs start with one, e.g. ["en", "es"]. */
  locales?: string[];
  /** The locale whose copy is the source the others follow. Default the first locale. */
  sourceLocale?: string;
  /** The current path. Pass it from the framework's router so pins follow client-side navigation; default reads window.location. */
  pathname?: string;
  /** Client-side navigation to another page's note. Default: a full navigation. */
  onNavigate?: (path: string) => void;
  /** Cookie name prefix, matching the server. Default "site-edit". */
  cookiePrefix?: string;
  /** How long a hold is, in ms. Default 450, under the ~500ms at which iOS opens its link previews. */
  holdMs?: number;
  /** Colours and fonts, for sites without CSS tokens; sets the --se-* variables. By default the widget inherits the page's font and colours. */
  theme?: SiteEditTheme;
  /** The widget's strings in other languages, keyed by locale; English is built in. Type each as `Messages` to prove it complete. */
  messages?: Languages;
  /** Forces the language. Default: the page's locale when a language was given for it, else the browser's, else English. */
  uiLocale?: string;
};

export type SiteEditTheme = Partial<{
  /** Text colour. Default: inherited from the page. */
  ink: string;
  /** Surface colour of boxes and the tray. Default: the page's canvas. */
  paper: string;
  /** Pins, primary buttons, focus. Default: a blue. */
  accent: string;
  /** Hover and links in the accent. Default: derived from accent. */
  accentInk: string;
  /** Text on the accent. Default white. */
  onAccent: string;
  /** Borders. Default: derived from the text colour. */
  line: string;
  /** Secondary text. Default: derived from the text colour. */
  muted: string;
  /** Destructive actions and failures. */
  error: string;
  /** Font family. Default: inherited from the page. */
  font: string;
  /** Monospace family for numbers and labels. */
  mono: string;
  /** Corner radius of boxes, in px or any CSS length. */
  radius: string | number;
}>;

const THEME_VARS: Record<keyof SiteEditTheme, string> = { ink: "--se-ink", paper: "--se-paper", accent: "--se-accent", accentInk: "--se-accent-ink", onAccent: "--se-on-accent", line: "--se-line", muted: "--se-muted", error: "--se-error", font: "--se-font", mono: "--se-mono", radius: "--se-radius" };

type Note = {
  id: string;
  text: string;
  path: string;
  locale: string;
  languages: "both" | "this";
  viewport: { w: number; h: number };
  element: Described;
};
type Point = { x: number; y: number };
type Draft = Point & { element: Described; text: string; languages: "both" | "this"; /** Set when editing an existing note. */ id?: string };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const noop = () => () => {};
const onClient = typeof window !== "undefined";
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

// Below 1024px: boxes with a text field become bottom sheets, since a fixed popover and the phone
// keyboard do not get on.
const PHONE = "(max-width: 1023px)";
const subscribePhone = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const phoneNow = () => window.matchMedia(PHONE).matches;

// The path without a router: window.location, refreshed on history moves.
const subscribePath = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const pathNow = () => window.location.pathname;

export function SiteEdit({ basePath = "/api/site-edit", pr, branch, locales = [], sourceLocale = locales[0], pathname: pathProp, onNavigate, cookiePrefix = "site-edit", holdMs = 450, theme, uiLocale, messages: languages }: SiteEditProps) {
  const base = basePath.replace(/\/$/, "");
  const ownPath = useSyncExternalStore(subscribePath, pathNow, () => "/");
  const pathname = pathProp ?? ownPath;
  const segment = pathname.split("/")[1] ?? "";
  const locale = locales.includes(segment) ? segment : "";
  const multilingual = locales.length > 1;
  const m = resolveMessages(pickLocale([uiLocale, locale, ...browserLocales()], languages), languages);
  const pageLabel = (path: string) => (locale ? path.replace(new RegExp(`^/(${locales.join("|")})(?=/|$)`), "") : path) || "/";
  const NOTES_KEY = `${cookiePrefix}:notes:${pr ? `pr-${pr}` : branch || "local"}`;
  const MODE_KEY = `${cookiePrefix}:mode`;
  const uiCookie = () => document.cookie.split("; ").find((c) => c.startsWith(`${cookiePrefix}-ui=`))?.slice(cookiePrefix.length + 4) ?? "";

  // Renders nothing on the server and during hydration; state then comes from cookie and storage.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const phone = useSyncExternalStore(subscribePhone, phoneNow, () => false);
  const [login, setLoginName] = useState(() => (onClient ? uiCookie() : ""));
  const editor = login !== "";
  // `?edit=1` is how sign-in returns: comment mode on, and the parameter dropped from the address.
  const [mode, setMode] = useState<boolean>(() => onClient && (read<boolean>(MODE_KEY, false) || new URLSearchParams(window.location.search).has("edit")));
  const [notes, setNotes] = useState<Note[]>(() => (onClient ? read<Note[]>(NOTES_KEY, []) : []));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [signIn, setSignIn] = useState<Point | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // Back from sign-in, the tray starts open: its hint says what to do next.
  const [open, setOpen] = useState(() => onClient && editor && new URLSearchParams(window.location.search).has("edit"));
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, Point | null>>(new Map());
  const stateRef = useRef({ editor, mode, locale });
  useEffect(() => {
    stateRef.current = { editor, mode, locale };
  }, [editor, mode, locale]);

  useEffect(() => {
    if (mounted) ensureStyles();
  }, [mounted]);

  // The theme goes on <html>, not on the widget's root: the phone's sheets are portaled to <body>.
  const themeJson = JSON.stringify(theme ?? null);
  useEffect(() => {
    const t = JSON.parse(themeJson) as SiteEditTheme | null;
    if (!t) return;
    const root = document.documentElement.style;
    for (const [key, name] of Object.entries(THEME_VARS) as [keyof SiteEditTheme, string][]) {
      const value = t[key];
      if (value === undefined) continue;
      root.setProperty(name, typeof value === "number" ? `${value}px` : value);
    }
    return () => {
      for (const [key, name] of Object.entries(THEME_VARS) as [keyof SiteEditTheme, string][]) if (t[key] !== undefined) root.removeProperty(name);
    };
  }, [themeJson]);

  useEffect(() => {
    if (!mounted) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("edit")) return;
    url.searchParams.delete("edit");
    window.history.replaceState(window.history.state, "", url.toString());
    if (editor) write(MODE_KEY, true);
  }, [mounted, editor, MODE_KEY]);

  const saveNotes = useCallback(
    (next: Note[]) => {
      setNotes(next);
      write(NOTES_KEY, next.length ? next : null);
    },
    [NOTES_KEY],
  );
  const setModeStored = useCallback(
    (on: boolean) => {
      setMode(on);
      write(MODE_KEY, on ? true : null);
    },
    [MODE_KEY],
  );

  // Gestures. Desktop: Alt+right-click drops a note (turning comment mode on), or offers sign-in
  // without a session. Touch: a two-finger hold offers sign-in, or turns comment mode on; nothing
  // native uses it, so every visitor gets it. A one-finger hold drops a note and only exists in
  // comment mode, so outside it everyone keeps their native long-press menus and selection.
  useEffect(() => {
    if (!mounted) return;
    let timer: number | undefined;
    let touches: Point[] = []; // where the fingers came down; empty once they are all up
    let fired = false;

    const begin = (node: EventTarget | null, at: Point) => {
      const el = target(node);
      if (!el) return;
      const s = stateRef.current;
      if (!s.editor) return setSignIn(at);
      setModeStored(true);
      setActive(null);
      setStatus("idle");
      setDraft({ ...at, element: describe(el), text: "", languages: !multilingual || s.locale === sourceLocale ? "both" : "this" });
    };
    const enter = (at: Point) => {
      if (!stateRef.current.editor) return setSignIn(at);
      setModeStored(true);
      setOpen(true); // the tray's hint reminds that one finger drops the note
      setActive(null);
      setDraft(null);
    };
    const hold = (fn: () => void) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fired = true;
        fn();
      }, holdMs);
    };
    const onContextMenu = (e: MouseEvent) => {
      if (touches.length) return e.preventDefault(); // touch: the timer decides, not the native menu
      if (!e.altKey) return;
      e.preventDefault();
      begin(e.target, { x: e.clientX, y: e.clientY });
    };
    const onTouchStart = (e: TouchEvent) => {
      if (target(e.target) === null) return;
      touches = [...e.touches].map((t) => ({ x: t.clientX, y: t.clientY }));
      window.clearTimeout(timer);
      if (touches.length === 2) {
        const [a, b] = touches;
        hold(() => enter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
      } else if (touches.length === 1 && stateRef.current.editor && stateRef.current.mode) {
        const node = e.target;
        const at = touches[0];
        hold(() => begin(node, at));
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touches.length) return;
      const moved = [...e.touches].some((t, i) => touches[i] && Math.hypot(t.clientX - touches[i].x, t.clientY - touches[i].y) > 10);
      if (moved) window.clearTimeout(timer);
    };
    const onTouchEnd = (e: TouchEvent) => {
      window.clearTimeout(timer);
      if (e.touches.length) return; // a finger is still down
      touches = [];
      if (fired) {
        if (e.cancelable) e.preventDefault(); // no click after a hold
        // The hold fired from a timer, which iOS does not count as a gesture: a focus made there
        // leaves the keyboard down. This touch end is one, so the new note's field is focused here,
        // and the sheet's own focus handling keeps the page from scrolling it away.
        document.querySelector<HTMLTextAreaElement>("[data-site-edit] textarea")?.focus();
        window.setTimeout(() => (fired = false), 400);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (fired) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", onTouchEnd, { passive: false });
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("click", onClick, true);
    };
  }, [mounted, setModeStored, holdMs, multilingual, sourceLocale]);

  // A click on the page, outside the widget, closes the sign-in box, an open note, and an empty
  // draft. A draft with text stays, so a stray tap does not lose it.
  useEffect(() => {
    if (!signIn && !active && !draft) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-site-edit]")) return;
      setSignIn(null);
      setActive(null);
      setDraft((d) => (d && d.text.trim() ? d : null));
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [signIn, active, draft]);

  // A click anywhere outside the tray closes it, including on a pin or the page.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-site-edit-tray]")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // In comment mode on a phone, a hold is a tool: no iOS callout on links and images, and no text
  // selection starting under the finger. The widget's own boxes opt back in.
  useEffect(() => {
    const style = document.documentElement.style as CSSStyleDeclaration & { webkitTouchCallout?: string };
    const off = editor && mode && phone;
    style.webkitTouchCallout = off ? "none" : "";
    style.webkitUserSelect = off ? "none" : "";
    style.userSelect = off ? "none" : "";
  }, [editor, mode, phone]);

  // Pins follow their elements: positions are measured on scroll and resize, not stored. State
  // only changes when a position did, so an idle page does not re-render on every scroll frame.
  const layout = useCallback(() => {
    const next = new Map<string, Point | null>();
    for (const n of notes) {
      if (n.path !== pathname) continue;
      const el = find(n.element);
      if (!el) {
        next.set(n.id, null);
        continue;
      }
      const r = el.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      next.set(n.id, visible ? { x: clamp(r.left - 12, 14, window.innerWidth - 14), y: clamp(r.top + 12, 14, window.innerHeight - 14) } : null);
    }
    setPositions((prev) => {
      if (prev.size !== next.size) return next;
      for (const [id, p] of next) {
        const q = prev.get(id);
        if (q === undefined || (p === null) !== (q === null) || (p && q && (p.x !== q.x || p.y !== q.y))) return next;
      }
      return prev;
    });
  }, [notes, pathname]);

  useEffect(() => {
    if (!editor || !mode) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };
    schedule();
    const later = [window.setTimeout(schedule, 300), window.setTimeout(schedule, 1200)];
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      later.forEach(clearTimeout);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, mode, layout]);

  const startSignIn = () => {
    // A route handler that redirects to GitHub, not a page: a full navigation on purpose.
    window.location.href = `${window.location.origin}${base}/auth?return=${encodeURIComponent(pathname)}`;
  };

  const logout = async () => {
    try {
      await fetch(`${base}/auth`, { method: "DELETE" });
    } catch {}
    setLoginName("");
    setModeStored(false);
    setOpen(false);
  };

  // The batch with the draft in it: an edited note replaced, a new one appended.
  const withDraft = (): Note[] | null => {
    if (!draft || !draft.text.trim()) return null;
    if (draft.id) return notes.map((n) => (n.id === draft.id ? { ...n, text: draft.text.trim(), languages: draft.languages } : n));
    const note: Note = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text: draft.text.trim(),
      path: pathname,
      locale,
      languages: draft.languages,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      element: draft.element,
    };
    return [...notes, note];
  };
  // "Add more" (or "Save" for an edit): the note joins the batch and the form closes.
  const addNote = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = withDraft();
    if (!next) return;
    saveNotes(next);
    setDraft(null);
    setStatus("idle");
  };
  // "Request change": the batch with this note goes out from the form itself. The button reads
  // "Requesting…" meanwhile; on success the form closes and nothing else opens, on failure it
  // stays with the text and a line saying so.
  const requestFromForm = async () => {
    const next = withDraft();
    if (!next) return;
    if (await send(next)) setDraft(null);
  };

  /** Opens an existing note in the note box, prefilled; Save replaces its text. */
  const editNote = (n: Note, at: Point) => {
    setActive(null);
    setDraft({ ...at, id: n.id, element: n.element, text: n.text, languages: n.languages });
  };

  const remove = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id));
    setActive(null);
  };

  const goTo = (n: Note) => {
    setOpen(false);
    if (n.path !== pathname) return onNavigate ? onNavigate(n.path) : window.location.assign(n.path);
    find(n.element)?.scrollIntoView({ block: "center" });
    setActive(n.id);
  };

  const send = async (batch: Note[] = notes): Promise<boolean> => {
    setStatus("sending");
    const payload = {
      notes: batch.map((n, i) => ({ n: i + 1, text: n.text, path: n.path, locale: n.locale, languages: n.languages, viewport: n.viewport, element: n.element })),
      pr,
      ref: branch,
      origin: window.location.origin,
    };
    try {
      const res = await fetch(`${base}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        if (res.status === 401) setLoginName("");
        setStatus("failed");
        return false;
      }
      const { url } = (await res.json()) as { url: string };
      setSentUrl(url);
      saveNotes([]);
      setStatus("sent");
      return true;
    } catch {
      setStatus("failed");
      return false;
    }
  };

  if (!mounted) return null;

  const popover = (p: Point) => ({ left: clamp(p.x, 8, window.innerWidth - 328), top: clamp(p.y + 8, 8, window.innerHeight - 232) });
  const here = notes.filter((n) => n.path === pathname);
  const byPage = [...new Set(notes.map((n) => n.path))].map((p) => ({ path: p, items: notes.filter((n) => n.path === p) }));

  // A box beside the pin on desktop; on a phone a bottom panel, or the full screen for the note
  // form, the one box with a keyboard. The caller wraps it in Presence so it can animate out.
  const float = (key: string, at: Point, onClose: () => void, children: ReactNode, full = false) =>
    phone ? (
      <Panel key={key} title={key} closeLabel={m.close} onClose={onClose} full={full}>
        <div className="se-pad">{children}</div>
      </Panel>
    ) : (
      <div key={key} data-lenis-prevent="" className="se-box" style={popover(at)}>
        {children}
      </div>
    );
  const activeNote = active ? notes.find((x) => x.id === active) : undefined;
  const activeAt = activeNote ? positions.get(activeNote.id) : undefined;

  const tray = (
    <>
      <div className={cx(!phone && "se-scroll")}>
        {/* On a PR's preview: the agent's replies, and Ship or Discard, where the result is in view. */}
        {pr && <ReviewPanel pr={pr} basePath={base} uiLocale={uiLocale ?? locale} messages={languages} />}
        {notes.length === 0 && <p className="se-empty se-muted">{phone ? m.hintPhone : m.hintDesktop}</p>}
        {byPage.map((g) => (
          <div key={g.path} className="se-group">
            <p className="se-eyebrow se-group-title">{pageLabel(g.path)}</p>
            {g.items.map((n) => (
              <div key={n.id} className="se-note">
                <button type="button" onClick={() => goTo(n)} className="se-note-go">
                  <span className="se-note-n">{notes.indexOf(n) + 1}</span>
                  <span className="se-clamp">{n.text}</span>
                </button>
                <button type="button" aria-label={m.deleteChange} onClick={() => remove(n.id)} className="se-x">
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="se-footer">
        <div className="se-footer-left">
          <button type="button" className="se-btn" onClick={() => setModeStored(false)}>
            {m.exit}
          </button>
          <button type="button" className="se-btn" onClick={logout} title={login}>
            {m.logOut}
          </button>
        </div>
        <button type="button" className={cx("se-btn se-btn-primary", status === "sending" && "se-pulse")} onClick={() => send()} disabled={notes.length === 0 || status === "sending"}>
          {status === "sending" ? m.requesting : m.request(notes.length)}
        </button>
      </div>
      {status === "sent" && sentUrl && (
        <p className="se-status se-muted">
          {m.requested}{" "}
          <a href={sentUrl} target="_blank" rel="noreferrer" className="se-link">
            {m.followOnGitHub}
          </a>
          .
        </p>
      )}
      {status === "failed" && <p className="se-status se-error">{m.requestFailed}</p>}
    </>
  );

  return (
    <div data-site-edit="" className="se">
      <Presence show={!!signIn}>
        {signIn &&
          float(
          m.titleSignIn,
          signIn,
          () => setSignIn(null),
          <>
            <p className="se-p se-muted">{m.signInNeeded}</p>
            <div className="se-row">
              <button type="button" className="se-btn" onClick={() => setSignIn(null)}>
                {m.cancel}
              </button>
              <button type="button" className="se-btn se-btn-primary" onClick={startSignIn}>
                {m.signIn}
              </button>
            </div>
          </>,
        )}
      </Presence>

      {editor && mode && (
        <>
          {here.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const i = notes.indexOf(n) + 1;
            return (
              <button key={n.id} type="button" aria-label={`${m.titleChange} ${i}`} onClick={() => setActive(active === n.id ? null : n.id)} className="se-pin" data-active={active === n.id ? "" : undefined} style={{ left: p.x, top: p.y }}>
                {i}
              </button>
            );
          })}

          <Presence show={!!(activeNote && activeAt)}>
            {activeNote &&
              activeAt &&
              float(
              m.titleChange,
              activeAt,
              () => setActive(null),
              <>
                <p className="se-eyebrow">
                  {notes.indexOf(activeNote) + 1} · {activeNote.element.component ?? m.page} › {activeNote.element.tag}
                </p>
                <p className="se-p se-mt1" style={{ fontSize: 14 }}>
                  {activeNote.text}
                </p>
                {/* Tapping outside or on the pin closes it; the buttons are for what changes the note. */}
                <div className="se-row se-between">
                  <button type="button" className="se-btn se-btn-quiet-danger" onClick={() => remove(activeNote.id)}>
                    {m.delete}
                  </button>
                  <button type="button" className="se-btn" onClick={() => editNote(activeNote, activeAt)}>
                    {m.edit}
                  </button>
                </div>
              </>,
            )}
          </Presence>

          <Presence show={!!draft}>
            {draft &&
              float(
              draft.id ? m.titleEditChange : m.titleNewChange,
              draft,
              () => setDraft(null),
              <form onSubmit={addNote}>
                <p className="se-eyebrow">
                  {draft.id ? notes.findIndex((n) => n.id === draft.id) + 1 : notes.length + 1} · {draft.element.component ?? m.page} › {draft.element.tag}
                </p>
                {draft.element.text && <p className="se-p se-mt1 se-muted se-truncate" style={{ fontSize: 12 }}>“{draft.element.text}”</p>}
                <textarea
                  // Not on phones: a focus outside a gesture is silent there; the hold's touch end does it.
                  autoFocus={!phone}
                  rows={3}
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                    if (e.key === "Escape") setDraft(null);
                  }}
                  placeholder={m.placeholder}
                  className={cx("se-field se-mt2", phone && "se-field-phone")}
                />
                {multilingual && draft.element.text && (
                  <label className="se-check">
                    <input type="checkbox" checked={draft.languages === "both"} onChange={(e) => setDraft({ ...draft, languages: e.target.checked ? "both" : "this" })} />
                    {m.allLanguages}
                  </label>
                )}
                <div className="se-row">
                  {/* The phone panel closes from its bar; the desktop popover needs Cancel. */}
                  {!phone && (
                    <button type="button" className="se-btn" onClick={() => setDraft(null)}>
                      {m.cancel}
                    </button>
                  )}
                  {/* "Add more" (or Save) keeps building the batch; "Request" sends everything with this note. */}
                  <button type="submit" className="se-btn se-btn-secondary" disabled={!draft.text.trim()}>
                    {draft.id ? m.save : m.addMore}
                  </button>
                  <button type="button" className={cx("se-btn se-btn-primary", status === "sending" && "se-pulse")} onClick={requestFromForm} disabled={!draft.text.trim() || status === "sending"}>
                    {status === "sending" ? m.requesting : m.request(draft.id ? notes.length : notes.length + 1)}
                  </button>
                </div>
                {status === "failed" && <p className="se-p se-mt1 se-error se-right">{m.requestFailed}</p>}
              </form>,
              true,
            )}
          </Presence>

          <div data-site-edit-tray="" className="se-tray">
            {phone ? (
              <Presence show={open}>
                {open && (
                  <Panel title={m.titleChanges} closeLabel={m.close} onClose={() => setOpen(false)}>
                    {tray}
                  </Panel>
                )}
              </Presence>
            ) : (
              /* Hidden rather than unmounted when closed, so the review panel loads once. */
              <div data-lenis-prevent="" className="se-panel" hidden={!open}>
                {tray}
              </div>
            )}
            <button type="button" onClick={() => setOpen(!open)} className="se-toggle">
              <span className="se-dot" />
              {m.changes(notes.length)}
              {pr && <span style={{ fontFamily: "var(--se-mono, ui-monospace, Menlo, monospace)", fontSize: 12, opacity: 0.7 }}>PR #{pr}</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
