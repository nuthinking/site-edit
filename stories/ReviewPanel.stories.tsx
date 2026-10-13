import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewPanel } from "../src/client";
import { es, pull } from "./stub";

/* The approve page's panel, standalone: what the email's Ship link opens. */
const meta = {
  title: "ReviewPanel",
  component: ReviewPanel,
  args: { pr: 21, standalone: true },
  decorators: [(Story) => <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 0" }}><Story /></div>],
} satisfies Meta<typeof ReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = { "GET /review/21": { status: 200, body: { ok: true, pull: pull() } } };

/** An open pull request: Ship is one tap here. */
export const Open: Story = { parameters: { signedIn: true, api: open } };

/** Ship succeeds. */
export const Ships: Story = { parameters: { signedIn: true, api: { ...open, "POST /review/21": { status: 200, body: { ok: true, pull: pull({ state: "merged" }) } } } } };

/** The branch moved since the editor looked: GitHub refuses, the panel says so. */
export const Moved: Story = { parameters: { signedIn: true, api: { ...open, "POST /review/21": { status: 409, body: { ok: false, error: "moved", pull: pull({ sha: "ffffffffffffffffffffffffffffffffffffffff" }) } } } } };

/** Already merged. */
export const Merged: Story = { parameters: { signedIn: true, api: { "GET /review/21": { status: 200, body: { ok: true, pull: pull({ state: "merged" }) } } } } };

/** Discarded. */
export const Closed: Story = { parameters: { signedIn: true, api: { "GET /review/21": { status: 200, body: { ok: true, pull: pull({ state: "closed" }) } } } } };

/** No session: a sign-in link. */
export const SignedOut: Story = { parameters: { signedIn: false } };

/** GitHub did not answer. */
export const Unavailable: Story = { parameters: { signedIn: true, api: { "GET /review/21": { status: 503, body: { ok: false } } } } };

/** In Spanish. */
export const Spanish: Story = { args: { uiLocale: "es", messages: { es } }, parameters: { signedIn: true, api: open } };

/** In the tray's style, as on a preview. */
export const InTray: Story = { args: { standalone: false }, parameters: { signedIn: true, api: open } };
