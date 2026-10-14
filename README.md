# @nuthinking/site-edit

> Edit a website from the website.

Anyone with write access to the site's repository can sign in with GitHub, drop numbered pins on the live site or on a preview, write a note for each, and send the batch. A GitHub Actions workflow runs Claude Code on it, which makes the change on a branch and opens a pull request. Vercel builds a preview, an email arrives with screenshots of where each note pointed, the agent's replies, and a **Ship** link that merges to the live site. Notes on the preview go back to the same pull request.

Nothing technical reaches the editors: no GitHub, no diffs, no file names. The developer sets it up once, usually with the [`site-edit` skill](https://github.com/nuthinking/skills), which installs this package and walks through the GitHub, Vercel and Resend settings.

```text
pins and notes on the page ──▶ GitHub issue ──▶ Claude Code makes the change ──▶ pull request
        ▲                                                                              │
        │                                                                              ▼
   notes on the preview ◀── email: screenshots, replies, Ship ◀── Vercel preview deployment
```

## What it looks like

![A note on the headline: the pin's box names the component and the element, quotes its text, and takes the note](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/note.png)

| Notes across pages, in the tray | On a preview: the agent's replies, Ship and Discard |
|---|---|
| ![The tray lists the batch grouped by page, with Send](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/tray.png) | ![The review panel in the tray on a pull request's preview](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/review.png) |

| On a phone: the note form, full screen | The tray as a bottom panel | The approve page the email links to |
|---|---|---|
| ![The note form taking the phone's screen](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/phone-note.png) | ![The tray as a bottom panel](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/phone-tray.png) | ![The approve page: title, replies, Ship](https://raw.githubusercontent.com/nuthinking/site-edit/main/docs/screenshots/approve.png) |

The site in the pictures is the fake one Storybook wraps the widget in; the widget inherits its font and colours, and its accent is the default blue.

## What is in the package

| Entry | Runs | What it is |
|---|---|---|
| `@nuthinking/site-edit` | browser | `<SiteEdit />`, the widget: gestures, pins, notes, tray, review panel. Framework-agnostic React. |
| `@nuthinking/site-edit/next` | browser | The same widget wired to Next's App Router (`usePathname`, `router.push`), plus `<ReviewPanel />`. |
| `@nuthinking/site-edit/server` | server | `createSiteEdit()`: GitHub sign-in, the notes bridge, and Ship and Discard, as handlers on standard `Request` and `Response`. Also the sealing and the report rendering the email script uses. |
| `templates/` | repo | The two workflows, the email script, the Next route and approve page, and the rules block for `AGENTS.md`. |

## Install

```bash
npm install @nuthinking/site-edit
```

Peer dependencies: `react` and `react-dom` 18 or later; `next` 13.4 or later only for the `/next` entry.

## Next.js in five files

**1. The widget**, once, in the root layout. Vercel sets the two public variables on every build.

```tsx
import { SiteEdit } from "@nuthinking/site-edit/next";

<SiteEdit pr={process.env.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID} branch={process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF} locales={["en", "es"]} />
```

**2. The handlers**, on one catch-all route, `app/api/site-edit/[...path]/route.ts`:

```ts
import { createSiteEdit } from "@nuthinking/site-edit/server";

export const { GET, POST, DELETE } = createSiteEdit({ locales: ["en", "es"], pageFiles: (path) => [`app${path}/page.tsx`] });
```

**3. The approve page**, `app/admin/approve/[pr]/page.tsx`, which the email links to (see `templates/next/approve-page.tsx`).

**4. Environment variables**, in Vercel for every environment and in `.env.local`:

```text
SITE_EDIT_REPO=owner/name
SITE_EDIT_GITHUB_CLIENT_ID=      # the GitHub App
SITE_EDIT_GITHUB_CLIENT_SECRET=
SITE_EDIT_SECRET=                # any long random string; also a repository secret, for the email
SITE_EDIT_SITE_URL=https://example.com
SITE_EDIT_PREVIEW_PREFIX=my-project   # Vercel preview hostnames start with this
```

**5. The workflows and the email script**, copied from `templates/` into `.github/`, with the marked `SITE-EDIT` lines filled in.

Then the settings outside the code: a GitHub App for sign-in, repository secrets, Vercel deployment protection off for previews, and the Actions switch that lets workflows open pull requests. The skill lists them with the exact clicks; `templates/` and the skill's references are the source of truth.

## How it works

**Gestures.** On desktop, Alt+right-click on anything drops a pin and opens a note; without a session it offers GitHub sign-in. On a phone, a two-finger hold signs in or enters comment mode and opens the tray, whose hint says that one finger asks for a change; in comment mode a one-finger hold on an element drops a pin. Nothing native uses a two-finger hold, so visitors keep their long-press menus; the one-finger hold exists only in comment mode. On phones the note form takes the whole screen, the one surface with a keyboard, so nothing sits under the keyboard; the sign-in box, an open note and the tray are bottom panels. Both are plain CSS, no sheet library: one was tried and the iOS keyboard defeated it. The form's buttons are "Add more", to build a batch, and "Request change", which adds the note and sends everything at once; the tray's button is the same "Request change". The widget's labels say *changes*, not notes.

**What a pin carries.** The page path and locale; the nearest `data-component` name and which instance of it; the element's tag, class string, text, selection and image source; four ancestors; the viewport; and a CSS path for finding the element again. Class strings are literal in most source code, so the agent lands on the right line without React internals. Mark your site components with `data-component="<Name>"`, where the name is the file name.

**Sign-in.** A GitHub App of your own. The callback exchanges the code for a user token, asks GitHub whether the user has write access to the repository, and refuses otherwise. The session is a sealed cookie (AES-GCM through WebCrypto, keyed from `SITE_EDIT_SECRET`) for 30 days; a plain cookie with the login tells the widget to show itself. Previews on `*.vercel.app` are not registered callback URLs, so a preview sends the sign-in to the live site and gets the login back through a one-minute sealed grant bound to its origin.

**The bridge.** Send posts the batch; the server checks write access again and creates the issue with the user's own token, labelled `site-notes`, mentioning `@claude`, one numbered section per note. From a preview it comments on that PR instead, so the agent updates the same branch. The sender's primary GitHub address travels with the batch, sealed, so the email reaches them and nobody reading the repository sees it.

**Approval.** The review panel shows the PR's title, the agent's report rendered for editors, and **Ship** and **Discard**. Ship squash-merges under the editor's own token and carries the commit the editor was shown, so GitHub refuses if the branch moved since. Only branches with the agent's prefix can be shipped or discarded from the site. In the tray both actions sit behind a second tap; on the approve page Ship is one tap, since arriving from the email is the intention.

**Email.** The preview-email workflow runs when Vercel reports a successful preview, and when the Claude workflow starts it right after opening the PR. It screenshots each noted page on the preview, scrolled to the element each note pointed at, at desktop and phone width in every language, and sends them with the replies and the links through Resend. A marker comment on the PR keeps it to one email per commit.

## Configuration

`createSiteEdit(options)` reads the five secrets from the environment and takes the rest as options:

| Option | Default | Meaning |
|---|---|---|
| `basePath` | `/api/site-edit` | Where the handlers are mounted; the widget's `basePath` must match. |
| `locales`, `sourceLocale` | none, first locale | Locale segment at the start of URLs, and which one the others follow. |
| `previewPrefix` | env | Vercel project hostname prefix; or pass `previewOrigin(origin)` for another host. |
| `mention`, `branchPrefix`, `label`, `titlePrefix` | `@claude`, `claude/`, `site-notes`, `Site: ` | How the agent is triggered and recognised. |
| `pageFiles(path, locale)` | none | Files to point the agent at for a route. |
| `footer` | names `AGENTS.md` | The trailer after the notes. |

## Theming

Out of the box the widget inherits the page's font and text colour, takes its surfaces from the system canvas (so it follows the site's own dark mode), and derives borders and secondary text from the text colour. Only the accent is its own, a blue. Three ways to go further, from least to most control:

1. **Alias the site's tokens** in one CSS rule, for sites that have them (Tailwind `@theme`, CSS variables):

   ```css
   :root { --se-accent: var(--color-leaf); --se-accent-ink: var(--color-leaf-ink); --se-font: var(--font-sans); --se-radius: 6px; }
   ```

   The variables: `--se-ink`, `--se-paper`, `--se-accent`, `--se-accent-ink`, `--se-on-accent`, `--se-line`, `--se-muted`, `--se-error`, `--se-font`, `--se-mono`, `--se-radius`.

2. **The `theme` prop**, for sites without tokens; it sets the same variables:

   ```tsx
   <SiteEdit theme={{ accent: "#2e9e4f", radius: 6, font: "Inter, sans-serif" }} />
   ```

3. **Override the classes.** Every element carries one `se-*` class (`se-pin`, `se-box`, `se-toggle`, `se-btn-primary`, `se-field`...), applied at single-class specificity, so a site rule wins. The names are a stable API.

## Languages

The widget's own strings ship in English only. Other languages are the site's, given at runtime through `messages`, keyed by locale, and typed as `Messages` so the site's typecheck proves each one complete:

```tsx
import type { Messages } from "@nuthinking/site-edit/next";
const es: Messages = { ship: "Publicar", discard: "Descartar", /* every key */ };
<SiteEdit messages={{ es }} />
```

Which language shows, in order: the `uiLocale` prop; the page's locale when the site has locales and a language was given for it; the browser's languages; English. A language given with some keys missing reads English for those, so `messages={{ en: { ship: "Publish" } }}` also works as a way to reword single strings. The `site-edit` skill writes the file for a localised site when it installs the widget.

## Other frameworks

The handlers take a standard `Request` and return a `Response`, so any framework with a catch-all route can mount them: call `GET`, `POST` or `DELETE` with the request. The plain `@nuthinking/site-edit` entry takes `pathname` and `onNavigate` props for the router of your choice; without them it reads `window.location` and does full navigations.

## Development

```bash
npm install
npm run check       # types, build, tests
npm run storybook   # every state of the widget and the panel, on a fake site, with theme controls
```

## License

MIT
