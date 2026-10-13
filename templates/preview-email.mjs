/*
  Preview email. Run by workflows/preview-email.yml after Vercel deploys a preview. Finds the open
  `claude/` pull request for the deployed commit, works out which pages the notes were about from
  the linked issue (or the newest batch of notes on the PR), screenshots them on the preview at
  desktop and phone width in every language, and sends everything through Resend with links: the
  preview, Add notes (through sign-in), the Ship page on the live site, and the PR.
  Installed by the site-edit skill; the sealing and the report rendering come from the package.
*/
import { fileURLToPath } from "node:url";
import { open, repliesHtml } from "@nuthinking/site-edit/server";
import { chromium } from "playwright";

// An unset secret reaches the workflow as an empty string, so empty means "use the default".
const env = (name, fallback) => process.env[name] || fallback;
const REPO = env("REPO");
const PR_NUMBER = env("PR_NUMBER", "").trim();
const FORCE = env("FORCE", "") === "true"; // send again even if this commit already had an email
const SITE = env("SITE_URL", "").replace(/\/$/, "");
const LOCALES = env("LOCALES", "").split(/[,\s]+/).filter(Boolean); // [] when URLs have no locale segment
const APPROVE_PATH = env("APPROVE_PATH", "/admin/approve").replace(/\/$/, "");
const BASE_PATH = env("BASE_PATH", "/api/site-edit").replace(/\/$/, "");
const BRANCH_PREFIX = env("BRANCH_PREFIX", "claude/");
const FALLBACK_TO = env("EDIT_NOTIFY_EMAILS", "").split(/[,\s]+/).filter(Boolean);
const FROM = env("EDIT_FROM_EMAIL");
const REPLY_TO = env("EDIT_REPLY_TO");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "phone", width: 390, height: 844, isMobile: true },
];
const MAX_PAGES = 4;
const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** A page URL on the preview: locale segment when the site has them, then the route. */
const pageUrl = (origin, locale, route) => `${origin}${locale ? `/${locale}` : ""}${route === "/" ? (locale ? "" : "/") : route}`;

/** Vercel's successful preview for a commit, from GitHub's deployments; waits up to ten minutes for it. */
async function previewFor(sha) {
  for (let i = 0; i < 30; i++) {
    const deployments = await gh(`/repos/${REPO}/deployments?sha=${sha}&per_page=10`);
    for (const d of deployments.filter((d) => String(d.environment).startsWith("Preview"))) {
      const statuses = await gh(`/repos/${REPO}/deployments/${d.id}/statuses?per_page=5`);
      const ok = statuses.find((s) => s.state === "success");
      if (ok) return (ok.environment_url || ok.target_url || "").replace(/\/$/, "");
      if (statuses.some((s) => s.state === "failure" || s.state === "error")) throw new Error(`Vercel reported a failed preview for ${sha.slice(0, 7)}`);
    }
    await sleep(20_000);
  }
  throw new Error(`No successful preview for ${sha.slice(0, 7)} after ten minutes`);
}

/** The agent's replies as HTML for mail clients: the package's rendering with styles inlined. */
function repliesForMail(body) {
  return repliesHtml(body)
    .replace(/<h[1-6]>/g, '<p style="font-weight:600;margin:14px 0 6px">')
    .replace(/<\/h[1-6]>/g, "</p>")
    .replace(/<ul>/g, '<ul style="padding-left:20px;margin:6px 0">')
    .replace(/<ol>/g, '<ol style="padding-left:20px;margin:6px 0">')
    .replace(/<p>/g, '<p style="margin:6px 0">')
    .replace(/<code>/g, '<code style="font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#ECEDE8;padding:1px 4px;border-radius:3px">')
    .replace(/<a /g, '<a style="color:#1E40AF" ');
}

/**
 * What each note was about, from the batch's Markdown: its page (without the locale segment), the
 * component it pointed at, and the pin's locator (an HTML comment the bridge adds), so the picture
 * can be scrolled to the element itself.
 */
export function noteTargets(text) {
  const targets = [];
  const localePrefix = LOCALES.length ? new RegExp(`^/(?:${LOCALES.join("|")})(?=/|$)`) : null;
  for (const section of String(text ?? "").split(/^### /m).slice(1)) {
    let route = section.match(/Page: `(\/[^`\s]*)`/)?.[1] || "/";
    if (localePrefix) route = route.replace(localePrefix, "") || "/";
    const component = section.match(/Component: `([A-Za-z0-9_-]+)` ›/)?.[1];
    let locator = null;
    try {
      locator = JSON.parse(section.match(/<!--\s*locator:\s*(\{.*?\})\s*-->/)?.[1] ?? "null");
    } catch {}
    if (!locator && component) locator = { component, tag: section.match(/Component: `[^`]+` › `([a-z0-9]+)`/)?.[1], classes: section.match(/Classes: `([^`]*)`/)?.[1] };
    if (!targets.some((t) => t.route === route)) targets.push({ route, component, locator });
  }
  return targets.slice(0, MAX_PAGES);
}

/**
 * Runs in the page: scrolls through everything once (for reveal-on-scroll animations), then
 * scrolls so the noted element is mid-screen. Finds it by the pin's path, else by tag and class
 * inside the component (the agent may have changed the structure), else the component; the top
 * of the page when nothing matches.
 */
export async function positionAt(locator) {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
  const roots = locator?.component ? document.querySelectorAll(`[data-component="${locator.component}"]`) : [];
  const root = locator?.component ? (roots[locator.index ?? 0] ?? roots[0]) : locator?.scope === "body" ? document.body : document.querySelector("main");
  let el = null;
  if (root && locator?.css) {
    try {
      el = root.querySelector(`:scope > ${locator.css}`);
    } catch {}
  }
  if (!el && root && locator?.tag) el = Array.from(root.querySelectorAll(locator.tag)).find((e) => (e.getAttribute("class") ?? "").trim() === (locator.classes ?? "").trim()) ?? null;
  const target = el ?? (locator?.component ? root : null);
  if (target) {
    const r = target.getBoundingClientRect();
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const top = r.height > window.innerHeight - header ? r.top + window.scrollY - header : r.top + window.scrollY - (window.innerHeight - r.height) / 2;
    window.scrollTo(0, Math.max(0, top));
  } else window.scrollTo(0, 0);
  // Reveal animations take a moment; let them finish.
  await new Promise((r) => setTimeout(r, 2500));
  return el ? "element" : target ? "component" : "top";
}

/**
 * The address the bridge appended to a batch: the LAST `notify` marker in the text, since ours is
 * always at the end and note text cannot contain a comment marker. Sealed, so it needs the secret.
 */
export async function notifyAddress(text, secret) {
  const markers = [...String(text ?? "").matchAll(/<!--\s*notify:\s*v1:([A-Za-z0-9_-]+)\s*-->/g)];
  const last = markers.at(-1)?.[1];
  if (!last || !secret) return null;
  const email = (await open(last, secret))?.email;
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function main() {
  if (!REPO) throw new Error("REPO is required");
  if (!SITE) throw new Error("SITE_URL is required");
  if (!process.env.RESEND_API_KEY) {
    console.log("No RESEND_API_KEY; nothing to send.");
    return;
  }
  if (!FROM) throw new Error("EDIT_FROM_EMAIL is required: a sender on a domain verified in Resend, e.g. 'Site <notifications@example.com>'");

  // Started either for a PR (right after it was opened) or for a Vercel deployment (a later push).
  let pull;
  let SHA;
  let PREVIEW;
  if (PR_NUMBER) {
    pull = await gh(`/repos/${REPO}/pulls/${PR_NUMBER}`);
    if (pull.state !== "open" || !pull.head.ref.startsWith(BRANCH_PREFIX)) {
      console.log(`PR #${PR_NUMBER} is not an open ${BRANCH_PREFIX} pull request; nothing to send.`);
      return;
    }
    SHA = pull.head.sha;
    PREVIEW = await previewFor(SHA);
  } else {
    SHA = env("DEPLOYMENT_SHA");
    PREVIEW = env("PREVIEW_URL", "").replace(/\/$/, "");
    if (!PREVIEW || !SHA) throw new Error("PREVIEW_URL and DEPLOYMENT_SHA are required");
    const pulls = (await gh(`/repos/${REPO}/commits/${SHA}/pulls`)).filter((p) => p.state === "open" && p.head.ref.startsWith(BRANCH_PREFIX));
    if (pulls.length === 0) {
      console.log(`No open ${BRANCH_PREFIX} pull request for this commit; nothing to send.`);
      return;
    }
    pull = pulls[0];
  }

  // One email per commit: both ways in can fire for the same preview.
  const marker = `<!-- preview-email: ${SHA} -->`;
  const prComments = await gh(`/repos/${REPO}/issues/${pull.number}/comments?per_page=100`);
  if (!FORCE && prComments.some((c) => c.body?.includes(marker))) {
    console.log(`An email for ${SHA.slice(0, 7)} was already sent; nothing to do.`);
    return;
  }

  // The pages and elements the notes were about: from the newest batch, which is a PR comment on a
  // second round, else the linked issue; home otherwise. The address of whoever sent the notes
  // travels with the batch, sealed: the newest batch wins. Issues written by hand on GitHub have
  // none; those go to EDIT_NOTIFY_EMAILS, if set.
  const issueNumber = pull.body?.match(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i)?.[1] ?? pull.head.ref.match(/issue-(\d+)/)?.[1];
  const secret = process.env.SITE_EDIT_SECRET ?? "";
  let issueText = "";
  if (issueNumber) {
    try {
      issueText = (await gh(`/repos/${REPO}/issues/${issueNumber}`)).body ?? "";
    } catch (error) {
      console.warn("Could not read the issue:", error.message);
    }
  }
  const commentBatches = prComments.map((c) => noteTargets(c.body ?? "")).filter((t) => t.length);
  const issueBatch = noteTargets(issueText);
  const targets = commentBatches.at(-1) ?? (issueBatch.length ? issueBatch : [{ route: "/" }]);
  const fromComments = (await Promise.all(prComments.map((c) => notifyAddress(c.body, secret)))).filter(Boolean);
  const address = fromComments.at(-1) ?? (await notifyAddress(issueText, secret));
  const to = address ? [address] : FALLBACK_TO;
  if (to.length === 0) {
    console.log("No address to send to (no notify marker in the batch, no EDIT_NOTIFY_EMAILS); nothing to send.");
    return;
  }

  // One picture per page, language and width: the screen scrolled to where the note pointed (the
  // top of the page when there is none), as the editor would see it. Never a full-page capture:
  // that stretches the window, and anything sized in vh with it.
  const browser = await chromium.launch();
  const attachments = [];
  const figures = [];
  let bytes = 0;
  for (const { route, component, locator } of targets) {
    const pageName = route === "/" ? "Home" : route.slice(1).replace(/\//g, " / ");
    for (const locale of LOCALES.length ? LOCALES : [""]) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: vp.isMobile ? 2 : 1 });
        const page = await context.newPage();
        const url = pageUrl(PREVIEW, locale, route);
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          // The widget mounts only once the page's JavaScript has taken over, which on a slow runner
          // is seconds after load; reveal animations often keep text hidden until then.
          await page.waitForSelector("[data-site-edit]", { state: "attached", timeout: 30_000 }).catch(() => console.warn(`JavaScript did not take over on ${url} within 30s`));
          await page.evaluate(() => document.fonts.ready);
          const found = await page.evaluate(positionAt, locator ?? null);
          if (found === "top" && component) console.warn(`${component} not found on ${url}; picture taken at the top`);
          const content = await page.screenshot({ type: "jpeg", quality: 70 });
          const id = `${route === "/" ? "home" : route.slice(1).replace(/\//g, "-")}${locale ? `-${locale}` : ""}-${vp.name}`;
          if (bytes + content.length <= MAX_ATTACHMENTS_BYTES) {
            attachments.push({ filename: `${id}.jpg`, content: content.toString("base64"), content_id: id });
            figures.push({ id, caption: [pageName, locale && locale.toUpperCase(), vp.name, component && `at ${component}`].filter(Boolean).join(" · "), width: vp.isMobile ? 320 : 640 });
            bytes += content.length;
          }
        } catch (error) {
          console.warn(`Screenshot failed for ${url}:`, error.message);
        }
        await context.close();
      }
    }
  }
  await browser.close();

  // The preview is for looking, so it asks nothing of whoever opens it. "Add notes" is for a second
  // round from a phone: every preview has its own address, so it goes through sign-in (the live
  // site's session, via GitHub) and lands on the preview in comment mode.
  const home = LOCALES.length ? `/${LOCALES[0]}` : "/";
  const previewLink = pageUrl(PREVIEW, LOCALES[0] ?? "", "/");
  const notesLink = `${PREVIEW}${BASE_PATH}/auth?return=${encodeURIComponent(home)}`;
  const shipLink = `${SITE}${APPROVE_PATH}/${pull.number}`;
  const replies = repliesForMail(pull.body);
  const pictures = figures
    .map((f) => `<p style="margin:18px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B">${escape(f.caption)}</p><img src="cid:${f.id}" alt="${escape(f.caption)}" width="${f.width}" style="display:block;max-width:100%;width:${f.width}px;border:1px solid #DCDCDC;border-radius:6px">`)
    .join("");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#141414;max-width:640px">
      <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B;margin:0 0 8px">Preview ready · PR #${pull.number}</p>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">${escape(pull.title)}</h1>
      <p style="margin:0 0 20px">
        <a href="${escape(previewLink)}" style="display:inline-block;background:#1D4ED8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">See the preview</a>
        &nbsp; <a href="${escape(shipLink)}" style="color:#1E40AF">Ship it</a>
        &nbsp;·&nbsp; <a href="${escape(pull.html_url)}" style="color:#1E40AF">On GitHub</a>
        &nbsp;·&nbsp; <a href="${escape(notesLink)}" style="color:#1E40AF">Add notes</a>
      </p>
      <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B;margin:0 0 6px">Replies</p>
      <div style="background:#F7F7F7;border:1px solid #DCDCDC;border-radius:6px;padding:4px 14px;margin:0 0 20px">${replies}</div>
      <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B;margin:0">Screens</p>
      ${pictures}
      <p style="color:#6B6B6B;font-size:13px;margin-top:20px">Each screen is the preview scrolled to where the note pointed, at desktop and phone width. To ask for more changes, use Add notes (it signs you in on the preview), then press and hold on anything. Ship merges to the live site.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), subject: `Preview: ${pull.title}`, html, attachments }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  console.log(`Sent to ${to.join(", ")}: PR #${pull.number}, ${attachments.length} screenshots, ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
  await gh(`/repos/${REPO}/issues/${pull.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Preview email sent for ${SHA.slice(0, 7)}.\n${marker}` }) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
