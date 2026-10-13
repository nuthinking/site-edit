import type { Meta, StoryObj } from "@storybook/react-vite";
import { SiteEdit } from "../src/client";
import { es, notes, pull } from "./stub";

/*
  The widget in each of its states. The fake site around it comes from .storybook/preview.tsx;
  the "scheme" toolbar switches it to dark, and the theme controls set the --se-* variables.
*/
const meta = {
  title: "SiteEdit",
  component: SiteEdit,
  args: { locales: ["en", "es"], pathname: "/en", branch: "story" },
  argTypes: {
    theme: { control: "object", description: "Colours and fonts; sets the --se-* variables. Leave empty to inherit the page." },
    pr: { control: "text" },
    uiLocale: { control: "select", options: [undefined, "en", "es"] },
    messages: { control: "object" },
    holdMs: { control: { type: "number", min: 200, max: 1000, step: 50 } },
    pathname: { table: { disable: true } },
    onNavigate: { table: { disable: true } },
    basePath: { table: { disable: true } },
    cookiePrefix: { table: { disable: true } },
  },
} satisfies Meta<typeof SiteEdit>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile1", isRotated: false } };

/** A visitor, or an editor before signing in: the gesture offers GitHub sign-in. */
export const SignedOut: Story = { parameters: { signedIn: false, after: "gesture" } };

/** Signed in, nothing yet: the tray's empty state. */
export const Empty: Story = { parameters: { signedIn: true, mode: true, after: "tray" } };

/** The gesture on the headline: a numbered pin and the note box. */
export const Draft: Story = { parameters: { signedIn: true, mode: true, after: "gesture" } };

/** Three notes across two pages; the tray open. */
export const Notes: Story = { parameters: { signedIn: true, mode: true, notes, after: "tray" } };

/** A pin tapped: the note, with Delete and Close. */
export const OpenNote: Story = { parameters: { signedIn: true, mode: true, notes, after: "pin" } };

/** On a pull request's preview: the agent's replies and Ship or Discard in the tray. */
export const OnPreview: Story = {
  args: { pr: "21" },
  parameters: { signedIn: true, mode: true, pr: "21", after: "tray", api: { "GET /review/21": { status: 200, body: { ok: true, pull: pull() } } } },
};

/** A language given at runtime through `messages`, picked from the page's locale (/es), the browser's, or the uiLocale prop. */
export const Spanish: Story = { args: { pathname: "/es", messages: { es } }, parameters: { signedIn: true, mode: true, notes: notes.map((n) => ({ ...n, path: "/es", locale: "es" })), after: "tray" } };

/** Themed through the prop: a brand accent, square corners, the site's mono. Edit it in Controls. */
export const Themed: Story = {
  args: { theme: { accent: "#c2410c", accentInk: "#9a3412", radius: 2, mono: "Menlo, monospace" } },
  parameters: { signedIn: true, mode: true, notes, after: "tray" },
};

/** Phone: the note box is a bottom sheet. */
export const DraftPhone: Story = { globals: phone, parameters: { signedIn: true, mode: true, after: "gesture" } };

/** Phone: the tray is a bottom sheet. */
export const NotesPhone: Story = { globals: phone, parameters: { signedIn: true, mode: true, notes, after: "tray" } };

/** Phone: the sign-in box as a sheet. */
export const SignedOutPhone: Story = { globals: phone, parameters: { signedIn: false, after: "gesture" } };
