import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import { setApi, type ApiStub } from "../stories/stub";

/*
  Every story renders inside a small fake site (a header, a hero, two cards, each marked with
  data-component), with the widget's server stubbed: `parameters.api` answers fetches under
  /api/site-edit, `parameters.signedIn`, `mode` and `notes` seed the cookie and localStorage the
  widget reads on mount, and `parameters.after` performs the gesture that reaches the state.
  The toolbar's "scheme" switches the fake site between light and dark, with no --se-* tokens
  set, to show the widget inheriting the page.
*/
type Params = { api?: ApiStub; signedIn?: boolean; mode?: boolean; notes?: unknown[]; pr?: string; after?: "gesture" | "tray" | "pin" };

function seed(p: Params) {
  document.cookie = `site-edit-ui=${p.signedIn ? "tester" : ""}; path=/; max-age=${p.signedIn ? 3600 : 0}`;
  for (const key of Object.keys(localStorage)) if (key.startsWith("site-edit:")) localStorage.removeItem(key);
  if (p.mode) localStorage.setItem("site-edit:mode", "true");
  if (p.notes?.length) localStorage.setItem(`site-edit:notes:${p.pr ? `pr-${p.pr}` : "story"}`, JSON.stringify(p.notes));
}

function act(after: Params["after"]) {
  if (after === "gesture") {
    const h1 = document.querySelector("main h1");
    if (!h1) return;
    const r = h1.getBoundingClientRect();
    h1.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, altKey: true, clientX: r.left + 24, clientY: r.top + 16 }));
  }
  if (after === "tray") (document.querySelector("[data-site-edit-tray] > button") as HTMLButtonElement | null)?.click();
  if (after === "pin") (document.querySelector(".se-pin") as HTMLButtonElement | null)?.click();
}

function Stage({ id, after, children }: { id: string; after?: Params["after"]; children: React.ReactNode }) {
  useEffect(() => {
    if (!after) return;
    const t = window.setTimeout(() => act(after), after === "pin" ? 700 : 250);
    return () => window.clearTimeout(t);
  }, [id, after]);
  return <>{children}</>;
}

const site: Decorator = (Story, context) => {
  const p = context.parameters as Params;
  const dark = context.globals.scheme === "dark";
  seed(p);
  setApi(p.api ?? {});
  const text = dark ? "#e8e4d8" : "#1a1a1a";
  return (
    <div key={context.id} style={{ colorScheme: dark ? "dark" : "light", background: dark ? "#14181a" : "#faf9f6", color: text, fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', minHeight: "100vh", margin: -16, padding: "0 24px 48px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: `1px solid ${dark ? "#2a2f31" : "#e4e2dc"}` }}>
        <nav data-component="SiteHeader" style={{ display: "flex", gap: 24 }}>
          <strong>Acme Studio</strong>
          <a href="#" style={{ color: "inherit" }}>Work</a>
          <a href="#" style={{ color: "inherit" }}>About</a>
        </nav>
        <button type="button" style={{ background: "#c2410c", color: "#fff", border: 0, borderRadius: 999, padding: "8px 16px", font: "inherit" }}>
          Book a call
        </button>
      </header>
      <main>
        <section data-component="Hero" style={{ padding: "64px 0 32px", maxWidth: 720 }}>
          <p style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.6 }}>Design and build</p>
          <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "8px 0 16px", fontWeight: 600 }}>
            Redesign how your <span style={{ color: "#c2410c" }}>business</span> operates.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, opacity: 0.8 }}>We design the tools your team uses every day, built around how the work actually happens.</p>
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {["Weeks, not quarters", "You own everything", "Built with your team"].map((t) => (
            <article key={t} data-component="Card" style={{ border: `1px solid ${dark ? "#2a2f31" : "#e4e2dc"}`, borderRadius: 8, padding: 20 }}>
              <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t}</h2>
              <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.5 }}>Short explanation of the point, two lines long so the card has some body to it.</p>
            </article>
          ))}
        </section>
      </main>
      <Stage id={context.id} after={p.after}>
        <Story />
      </Stage>
    </div>
  );
};

const preview: Preview = {
  decorators: [site],
  globalTypes: {
    scheme: { description: "The fake site's colour scheme", toolbar: { title: "Scheme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true } },
  },
  initialGlobals: { scheme: "light" },
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
};

export default preview;
