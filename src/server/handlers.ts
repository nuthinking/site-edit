import { isNote, requestBody, type BodyOptions, type Note, type PullView } from "./body";
import { api, discardPull, getPull, github, githubEmail, githubLogin, hasWriteAccess, shipPull, type Pull } from "./github";
import { repliesHtml } from "./replies";
import { open, seal } from "./seal";

/*
  The server side of site editing, as one set of route handlers on standard Request and Response,
  so they mount in Next, Remix, SvelteKit, Astro or anything else with a catch-all route:

    GET    <basePath>/auth            start GitHub sign-in (a preview bounces to the live site)
    GET    <basePath>/auth/callback   GitHub returns here; the token must have write access
    GET    <basePath>/auth/accept     a preview receives a login made on the live site
    DELETE <basePath>/auth            sign out
    POST   <basePath>/request         a batch of notes becomes an issue (or a PR comment)
    GET    <basePath>/review/<pr>     the agent's pull request, for the panel
    POST   <basePath>/review/<pr>     { action: "ship" | "discard", sha }

  Who may edit: anyone with write access to the repository, signed in through a GitHub App. The
  session is a sealed cookie holding the user's token and login for 30 days; a plain cookie with
  the login tells the widget to show itself. Access is checked against GitHub again on every send
  and review. Everything on GitHub is done with the user's own token, so issues and merges are theirs.
*/
export type SiteEditConfig = {
  /** owner/name of the repository the site is built from. Env SITE_EDIT_REPO. */
  repo: string;
  /** The GitHub App's client id and secret. Env SITE_EDIT_GITHUB_CLIENT_ID, SITE_EDIT_GITHUB_CLIENT_SECRET. */
  clientId: string;
  clientSecret: string;
  /** Any long random string; seals the cookies and the notify marker. Env SITE_EDIT_SECRET. */
  secret: string;
  /** The live site's origin, registered with the GitHub App as a callback URL. Env SITE_EDIT_SITE_URL. */
  siteUrl: string;
  /** Where the handlers are mounted. Default "/api/site-edit". */
  basePath: string;
  /** Which other origins may receive a login: preview deployments. Default: Vercel previews whose hostname starts with `previewPrefix`. */
  previewOrigin?: (origin: string) => boolean;
  /** The Vercel project's hostname prefix, e.g. "my-site" for my-site-abc123-team.vercel.app. Env SITE_EDIT_PREVIEW_PREFIX. */
  previewPrefix?: string;
  /** The site's locales when its URLs start with one, e.g. ["en", "es"]. Default none. */
  locales: string[];
  /** The locale whose copy is the source the others follow. Default the first locale. */
  sourceLocale?: string;
  /** The trigger phrase the agent workflow listens for. Default "@claude". */
  mention: string;
  /** Branches the agent makes, the only ones the site may ship or discard. Default "claude/". */
  branchPrefix: string;
  /** The label put on issues the site creates. Default "site-notes". */
  label: string;
  /** Prefix for issue titles. Default "Site: ". */
  titlePrefix: string;
  /** Where a page's code lives, so the agent starts in the right file. */
  pageFiles?: BodyOptions["pageFiles"];
  /** The trailer after the notes. Default names AGENTS.md. */
  footer?: string;
  /** Cookie name prefix. Default "site-edit". */
  cookiePrefix: string;
};

export type Handler = (request: Request) => Promise<Response>;
export type SiteEditHandlers = { GET: Handler; POST: Handler; DELETE: Handler };

type Session = { login: string; token: string; at: number };

const MONTH = 60 * 60 * 24 * 30;
// Env without Node types: the handlers also run where `process` does not exist.
declare const process: { env?: Record<string, string | undefined> } | undefined;
const env = (name: string): string | undefined => (typeof process !== "undefined" ? process?.env?.[name] : undefined) || undefined;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const redirect = (to: URL | string, headers = new Headers()) => {
  headers.set("Location", String(to));
  return new Response(null, { status: 302, headers });
};

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
function setCookie(headers: Headers, name: string, value: string, o: { maxAge: number; path: string; httpOnly: boolean; secure: boolean }) {
  headers.append("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=${o.path}; Max-Age=${o.maxAge}; SameSite=Lax${o.httpOnly ? "; HttpOnly" : ""}${o.secure ? "; Secure" : ""}`);
}

/** The origin a request arrived on, as the browser sees it (hosts like Vercel forward it). */
export function requestOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** A path on this site, never another origin. */
export function safePath(value: string | null): string {
  return value && /^\/(?!\/)/.test(value) ? value : "/";
}

/** Whether an origin is a Vercel preview of the project whose hostnames start with `prefix`. */
export function isVercelPreview(origin: string, prefix: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app") && hostname.startsWith(prefix);
  } catch {
    return false;
  }
}

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

export function createSiteEdit(options: Partial<SiteEditConfig> = {}): SiteEditHandlers {
  const c: SiteEditConfig = {
    repo: options.repo ?? env("SITE_EDIT_REPO") ?? "",
    clientId: options.clientId ?? env("SITE_EDIT_GITHUB_CLIENT_ID") ?? "",
    clientSecret: options.clientSecret ?? env("SITE_EDIT_GITHUB_CLIENT_SECRET") ?? "",
    secret: options.secret ?? env("SITE_EDIT_SECRET") ?? "",
    siteUrl: options.siteUrl ?? env("SITE_EDIT_SITE_URL") ?? "",
    basePath: (options.basePath ?? "/api/site-edit").replace(/\/$/, ""),
    previewOrigin: options.previewOrigin,
    previewPrefix: options.previewPrefix ?? env("SITE_EDIT_PREVIEW_PREFIX"),
    locales: options.locales ?? [],
    sourceLocale: options.sourceLocale,
    mention: options.mention ?? "@claude",
    branchPrefix: options.branchPrefix ?? "claude/",
    label: options.label ?? "site-notes",
    titlePrefix: options.titlePrefix ?? "Site: ",
    pageFiles: options.pageFiles,
    footer: options.footer,
    cookiePrefix: options.cookiePrefix ?? "site-edit",
  };
  const base = c.basePath;
  const SESSION = c.cookiePrefix;
  const UI = `${c.cookiePrefix}-ui`;
  const STATE = `${c.cookiePrefix}-state`;
  const configured = () => [c.repo, c.clientId, c.clientSecret, c.secret, c.siteUrl].every((v) => v.length > 0);
  const isPreview = (origin: string) => (c.previewOrigin ? c.previewOrigin(origin) : c.previewPrefix ? isVercelPreview(origin, c.previewPrefix) : false);
  const canCallBack = (origin: string) => {
    try {
      const host = new URL(origin).host;
      return host === new URL(c.siteUrl).host || host.startsWith("localhost:") || host === "localhost";
    } catch {
      return false;
    }
  };
  const isAgentBranch = (ref: string) => ref.startsWith(c.branchPrefix);
  const route = (request: Request) => {
    const p = new URL(request.url).pathname;
    const i = p.indexOf(base);
    return i === -1 ? "" : p.slice(i + base.length).replace(/\/$/, "");
  };

  async function getSession(request: Request): Promise<Session | null> {
    const raw = cookie(request, SESSION);
    if (!raw || !c.secret) return null;
    const s = await open<Session>(raw, c.secret);
    return s && typeof s.token === "string" && typeof s.login === "string" ? s : null;
  }
  async function sessionCookies(session: Session, secure: boolean): Promise<Headers> {
    const headers = new Headers();
    setCookie(headers, SESSION, await seal(session, c.secret), { httpOnly: true, secure, path: "/", maxAge: MONTH });
    setCookie(headers, UI, session.login, { httpOnly: false, secure, path: "/", maxAge: MONTH });
    return headers;
  }
  function clearedCookies(secure: boolean): Headers {
    const headers = new Headers();
    setCookie(headers, SESSION, "", { httpOnly: true, secure, path: "/", maxAge: 0 });
    setCookie(headers, UI, "", { httpOnly: false, secure, path: "/", maxAge: 0 });
    return headers;
  }

  /** The session, checked against GitHub: 401 when there is none or access is gone, 503 when GitHub cannot be asked. */
  async function authed(request: Request): Promise<{ session: Session } | Response> {
    const session = await getSession(request);
    if (!session) return json({ ok: false }, 401);
    const access = await hasWriteAccess(session.token, c.repo);
    if (access === null) return json({ ok: false, error: "github" }, 503);
    if (!access) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: clearedCookies(requestOrigin(request).startsWith("https")) });
    return { session };
  }

  /* ---- Sign-in */
  async function startSignIn(request: Request): Promise<Response> {
    if (!configured()) return text("Site editing is not configured.", 503);
    const origin = requestOrigin(request);
    const returnTo = new URL(request.url).searchParams.get("return");
    if (!canCallBack(origin)) {
      if (!isPreview(origin)) return text("Not available here.", 403);
      // A preview is not a registered callback URL: sign in on the live site, then come back here.
      const back = new URL(`${base}/auth`, c.siteUrl);
      back.searchParams.set("return", `${origin}${safePath(returnTo)}`);
      return redirect(back);
    }
    // `return` is a path here, or a preview URL handed over from above.
    const target = returnTo && isPreview(returnTo) ? returnTo : safePath(returnTo);
    const state = randomHex(16);
    const headers = new Headers();
    setCookie(headers, STATE, await seal({ state, target }, c.secret), { httpOnly: true, secure: origin.startsWith("https"), path: `${base}/auth`, maxAge: 600 });
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", c.clientId);
    authorize.searchParams.set("redirect_uri", `${origin}${base}/auth/callback`);
    authorize.searchParams.set("state", state);
    return redirect(authorize, headers);
  }

  async function callback(request: Request): Promise<Response> {
    if (!configured()) return text("Site editing is not configured.", 503);
    const origin = requestOrigin(request);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const stored = await open<{ state: string; target: string }>(cookie(request, STATE) ?? "", c.secret);
    const headers = new Headers();
    setCookie(headers, STATE, "", { httpOnly: true, secure: origin.startsWith("https"), path: `${base}/auth`, maxAge: 0 });
    if (!code || !state || !stored || stored.state !== state) return text("Sign-in did not complete. Try again from the site.", 400);

    let token: string | undefined;
    try {
      const exchange = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: `${origin}${base}/auth/callback` }),
      });
      token = exchange.ok ? ((await exchange.json()) as { access_token?: string }).access_token : undefined;
    } catch {}
    if (!token) return text("GitHub did not issue a token. Try again from the site.", 502);

    const [login, allowed] = await Promise.all([githubLogin(token), hasWriteAccess(token, c.repo)]);
    if (allowed === null || !login) return text("GitHub did not answer. Try again in a moment.", 502);
    if (!allowed) return text("This GitHub account has no write access to the site's repository.", 403);

    const session: Session = { login, token, at: Date.now() };
    if (isPreview(stored.target)) {
      const preview = new URL(stored.target);
      const accept = new URL(`${base}/auth/accept`, preview.origin);
      accept.searchParams.set("grant", await seal({ session, origin: preview.origin, exp: Date.now() + 60_000 }, c.secret));
      accept.searchParams.set("return", preview.pathname);
      return redirect(accept, headers);
    }
    for (const [k, v] of await sessionCookies(session, origin.startsWith("https"))) headers.append(k, v);
    const back = new URL(stored.target, origin);
    back.searchParams.set("edit", "1");
    return redirect(back, headers);
  }

  async function accept(request: Request): Promise<Response> {
    if (!configured()) return text("Site editing is not configured.", 503);
    const origin = requestOrigin(request);
    const url = new URL(request.url);
    const grant = await open<{ session: Session; origin: string; exp: number }>(url.searchParams.get("grant") ?? "", c.secret);
    if (!grant || grant.origin !== origin || !isPreview(origin) || grant.exp < Date.now()) return text("Sign-in did not complete. Try again from the site.", 400);
    const back = new URL(safePath(url.searchParams.get("return")), origin);
    back.searchParams.set("edit", "1");
    return redirect(back, await sessionCookies(grant.session, true));
  }

  async function logout(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: clearedCookies(requestOrigin(request).startsWith("https")) });
  }

  /* ---- Notes to GitHub */
  type Payload = { notes: Note[]; pr?: string; ref?: string; origin?: string };
  async function sendNotes(request: Request): Promise<Response> {
    if (!configured()) return json({ ok: false, error: "unconfigured" }, 503);
    const auth = await authed(request);
    if (auth instanceof Response) return auth;
    const { token } = auth.session;

    let payload: Payload;
    try {
      payload = (await request.json()) as Payload;
    } catch {
      return json({ ok: false }, 400);
    }
    const list = Array.isArray(payload.notes) ? payload.notes.slice(0, 30) : [];
    if (list.length === 0 || !list.every((n) => isNote(n, c.locales))) return json({ ok: false, error: "invalid" }, 400);
    const notes = list.map((n, i) => ({ ...n, n: i + 1 }));
    const pr = typeof payload.pr === "string" && /^\d{1,7}$/.test(payload.pr) ? payload.pr : undefined;
    const ref = typeof payload.ref === "string" ? payload.ref.slice(0, 200) : "";
    const origin = typeof payload.origin === "string" && /^https?:\/\/[^\s/]+$/.test(payload.origin) ? payload.origin : "";

    const where = pr ? `the preview of PR #${pr}` : ref && ref !== "main" && ref !== "master" ? `branch ${ref}` : "the live site";
    // The preview email goes to whoever sent the notes: their address travels with the batch, sealed.
    const email = await githubEmail(token);
    const body =
      requestBody(notes, `${where}${origin ? ` (${origin})` : ""}`, { mention: c.mention, locales: c.locales, sourceLocale: c.sourceLocale, pageFiles: c.pageFiles, footer: c.footer }) +
      (email ? `\n<!-- notify: v1:${await seal({ email }, c.secret)} -->` : "");
    const pages = [...new Set(notes.map((n) => n.path))].join(", ");
    const title = notes.length === 1 ? `${c.titlePrefix}${notes[0].text.trim().slice(0, 72)}` : `${c.titlePrefix}${notes.length} notes on ${pages}`.slice(0, 120);

    const url = pr ? `${api}/repos/${c.repo}/issues/${pr}/comments` : `${api}/repos/${c.repo}/issues`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...github(token), "Content-Type": "application/json" },
        body: JSON.stringify(pr ? { body } : { title, body, labels: [c.label] }),
      });
      if (!res.ok) {
        console.error("site-edit: GitHub returned", res.status, await res.text());
        return json({ ok: false, error: "github" }, 502);
      }
      const created = (await res.json()) as { html_url: string };
      return json({ ok: true, url: created.html_url });
    } catch (error) {
      console.error("site-edit: GitHub unreachable", error);
      return json({ ok: false, error: "github" }, 502);
    }
  }

  /* ---- Review */
  const shape = (pull: Pull): PullView => ({
    number: pull.number,
    title: pull.title,
    body: pull.body ?? "",
    html: repliesHtml(pull.body),
    state: pull.merged ? "merged" : pull.state,
    url: pull.html_url,
    branch: pull.head.ref,
    sha: pull.head.sha,
    agent: isAgentBranch(pull.head.ref),
  });

  async function review(request: Request, number: number): Promise<Response> {
    if (!configured()) return json({ ok: false, error: "unconfigured" }, 503);
    const auth = await authed(request);
    if (auth instanceof Response) return auth;
    const pull = await getPull(auth.session.token, c.repo, number);
    if (!pull) return json({ ok: false, error: "not-found" }, 404);
    return json({ ok: true, pull: shape(pull) });
  }

  async function act(request: Request, number: number): Promise<Response> {
    if (!configured()) return json({ ok: false, error: "unconfigured" }, 503);
    const auth = await authed(request);
    if (auth instanceof Response) return auth;
    const { token } = auth.session;
    let action = "";
    let sha = "";
    try {
      const body = (await request.json()) as { action?: unknown; sha?: unknown };
      action = String(body.action ?? "");
      sha = String(body.sha ?? "");
    } catch {}
    if ((action !== "ship" && action !== "discard") || (action === "ship" && !/^[0-9a-f]{40}$/.test(sha))) return json({ ok: false }, 400);

    const pull = await getPull(token, c.repo, number);
    if (!pull) return json({ ok: false, error: "not-found" }, 404);
    if (!isAgentBranch(pull.head.ref)) return json({ ok: false, error: "not-agent" }, 403);
    if (pull.state !== "open") return json({ ok: false, error: "closed", pull: shape(pull) }, 409);

    if (action === "discard") {
      if (!(await discardPull(token, c.repo, pull))) return json({ ok: false, error: "github" }, 502);
      return json({ ok: true, pull: { ...shape(pull), state: "closed" } });
    }
    // Ship only the commit the editor looked at.
    if (pull.head.sha !== sha) return json({ ok: false, error: "moved", pull: shape(pull) }, 409);
    const result = await shipPull(token, c.repo, pull, sha);
    if (result === "moved") return json({ ok: false, error: "moved", pull: shape(pull) }, 409);
    if (result === "failed") return json({ ok: false, error: "github" }, 502);
    return json({ ok: true, pull: { ...shape(pull), state: "merged" } });
  }

  /* ---- Dispatch */
  const reviewNumber = (rel: string) => rel.match(/^\/review\/(\d{1,7})$/)?.[1];
  return {
    async GET(request) {
      const rel = route(request);
      if (rel === "/auth") return startSignIn(request);
      if (rel === "/auth/callback") return callback(request);
      if (rel === "/auth/accept") return accept(request);
      const pr = reviewNumber(rel);
      if (pr) return review(request, Number(pr));
      return json({ ok: false }, 404);
    },
    async POST(request) {
      const rel = route(request);
      if (rel === "/request") return sendNotes(request);
      const pr = reviewNumber(rel);
      if (pr) return act(request, Number(pr));
      return json({ ok: false }, 404);
    },
    async DELETE(request) {
      if (route(request) === "/auth") return logout(request);
      return json({ ok: false }, 404);
    },
  };
}
