import assert from "node:assert/strict";
import { test } from "node:test";
import { createSiteEdit, isNote, isVercelPreview, open, repliesHtml, requestBody, seal } from "../dist/server/index.js";

const note = (over = {}) => ({
  n: 1,
  text: "Say Minutes instead of Weeks",
  path: "/en",
  locale: "en",
  languages: "both",
  viewport: { w: 1440, h: 900 },
  element: { component: "Hero", index: 0, tag: "h1", classes: "text-xl", text: "Weeks", ancestors: ["div.wrap"], css: "div > h1" },
  ...over,
});

test("seal and open round-trip; a wrong secret opens nothing", async () => {
  const sealed = await seal({ email: "a@b.co" }, "secret-one");
  assert.match(sealed, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await open(sealed, "secret-one"), { email: "a@b.co" });
  assert.equal(await open(sealed, "secret-two"), null);
  assert.equal(await open("not-sealed", "secret-one"), null);
});

test("isNote accepts the widget's shape and the configured locales only", () => {
  assert.equal(isNote(note(), ["en", "es"]), true);
  assert.equal(isNote(note({ locale: "fr" }), ["en", "es"]), false);
  assert.equal(isNote(note({ locale: "" }), []), true);
  assert.equal(isNote(note({ text: "  " }), ["en"]), false);
  assert.equal(isNote({ ...note(), element: undefined }, ["en"]), false);
});

test("requestBody mentions the agent, numbers the notes, and hides markers from note text", () => {
  const body = requestBody([note({ text: "Fix this --> now" }), note({ n: 2, text: "And this", languages: "this", locale: "es", path: "/es" })], "the live site", { locales: ["en", "es"], pageFiles: (p) => [`app${p}/page.tsx`] });
  assert.ok(body.startsWith("@claude 2 notes from the site"));
  assert.match(body, /### 1\. Fix this - -> now/);
  assert.match(body, /Page: `\/en` \(`app\/en\/page.tsx`\)/);
  assert.match(body, /Languages: all \(change the en source, then match es\)/);
  assert.match(body, /Languages: only es/);
  assert.match(body, /<!-- locator: \{"component":"Hero"/);
  assert.match(body, /Rules for changes to the site are in `AGENTS.md`/);
});

test("repliesHtml drops the action header and trailers and escapes raw HTML", () => {
  const html = repliesHtml("**Claude finished** —— [View job](x)\n\n---\n### Done\n\n1. **Hero**: done. <script>alert(1)</script>\n\n· branch `claude/issue-1`\n\nCloses #1\n");
  assert.match(html, /<h3>Done<\/h3>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /Claude finished|Closes #1|claude\/issue-1/);
});

test("isVercelPreview checks protocol, suffix and prefix", () => {
  assert.equal(isVercelPreview("https://my-site-abc-team.vercel.app", "my-site"), true);
  assert.equal(isVercelPreview("https://other-abc-team.vercel.app", "my-site"), false);
  assert.equal(isVercelPreview("http://my-site-abc-team.vercel.app", "my-site"), false);
});

test("handlers route by path, refuse when unconfigured, and 404 elsewhere", async () => {
  const h = createSiteEdit({ repo: "", clientId: "", clientSecret: "", secret: "", siteUrl: "" });
  assert.equal((await h.GET(new Request("https://site.test/api/site-edit/auth"))).status, 503);
  assert.equal((await h.POST(new Request("https://site.test/api/site-edit/request", { method: "POST" }))).status, 503);
  assert.equal((await h.GET(new Request("https://site.test/api/site-edit/nothing"))).status, 404);
  assert.equal((await h.DELETE(new Request("https://site.test/api/site-edit/auth", { method: "DELETE" }))).status, 200);
});

test("sign-in redirects to GitHub with a state cookie, and a stranger origin is refused", async () => {
  const h = createSiteEdit({ repo: "o/r", clientId: "id", clientSecret: "s", secret: "k", siteUrl: "https://site.test", previewPrefix: "site" });
  const res = await h.GET(new Request("https://site.test/api/site-edit/auth?return=/en"));
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"));
  assert.equal(to.origin, "https://github.com");
  assert.equal(to.searchParams.get("redirect_uri"), "https://site.test/api/site-edit/auth/callback");
  assert.match(res.headers.get("set-cookie"), /^site-edit-state=.*Path=\/api\/site-edit\/auth.*HttpOnly.*Secure/);
  // A preview bounces to the live site with its own URL as the return.
  const preview = await h.GET(new Request("https://site-abc-team.vercel.app/api/site-edit/auth?return=/en", { headers: { host: "site-abc-team.vercel.app" } }));
  assert.equal(preview.status, 302);
  assert.equal(preview.headers.get("location"), "https://site.test/api/site-edit/auth?return=https%3A%2F%2Fsite-abc-team.vercel.app%2Fen");
  const stranger = await h.GET(new Request("https://evil.test/api/site-edit/auth", { headers: { host: "evil.test" } }));
  assert.equal(stranger.status, 403);
});

test("a request without a session is 401; review of a bad number is 404", async () => {
  const h = createSiteEdit({ repo: "o/r", clientId: "id", clientSecret: "s", secret: "k", siteUrl: "https://site.test" });
  const res = await h.POST(new Request("https://site.test/api/site-edit/request", { method: "POST", body: JSON.stringify({ notes: [note()] }), headers: { "content-type": "application/json" } }));
  assert.equal(res.status, 401);
  assert.equal((await h.GET(new Request("https://site.test/api/site-edit/review/abc"))).status, 404);
});
