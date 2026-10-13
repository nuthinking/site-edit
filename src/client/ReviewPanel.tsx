import { useEffect, useState } from "react";
import type { PullView } from "../server/body";
import { browserLocales, pickLocale, resolveMessages, type Languages } from "./messages";
import { ensureStyles } from "./styles";

/*
  One of the agent's pull requests, for a signed-in editor: the title, the agent's replies to the
  notes (its PR description, rendered), and Ship or Discard. Used inside the tray on a preview
  deployment, where both sit behind a second tap, and standalone on the approve page the email
  links to, where Ship is one tap: arriving from the email is the intention. Discard keeps its
  second tap everywhere. Ship sends the commit that was shown; if the branch moved since, GitHub
  refuses and the panel says so.
*/
type Problem = "signin" | "missing" | "unavailable";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export type ReviewPanelProps = {
  /** The pull request number. */
  pr: string | number;
  /** Where the handlers are mounted. Default "/api/site-edit". */
  basePath?: string;
  /** On its own page rather than in the tray: larger text, no border, Ship in one tap. */
  standalone?: boolean;
  /** The panel's strings in other languages, keyed by locale; English is built in. */
  messages?: Languages;
  /** Forces the language. Default: the browser's when a language was given for it, else English. */
  uiLocale?: string;
};

export function ReviewPanel({ pr, basePath = "/api/site-edit", standalone = false, uiLocale, messages: languages }: ReviewPanelProps) {
  const m = resolveMessages(pickLocale([uiLocale, ...browserLocales()], languages), languages);
  const [pull, setPull] = useState<PullView | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"ship" | "discard" | null>(null);
  const [busy, setBusy] = useState(false);
  const base = basePath.replace(/\/$/, "");

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`${base}/review/${pr}`)
      .then(async (res) => {
        if (!live) return;
        if (res.status === 401) return setProblem("signin");
        if (res.status === 404) return setProblem("missing");
        if (!res.ok) return setProblem("unavailable");
        setPull(((await res.json()) as { pull: PullView }).pull);
      })
      .catch(() => live && setProblem("unavailable"));
    return () => {
      live = false;
    };
  }, [pr, base]);

  const act = async (action: "ship" | "discard") => {
    if (!pull) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${base}/review/${pr}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sha: pull.sha }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; pull?: PullView };
      if (res.ok && data.pull) setPull(data.pull);
      else if (res.status === 401) setProblem("signin");
      else if (data.error === "moved" && data.pull) {
        setPull(data.pull);
        setNotice(m.moved);
      } else if (data.error === "closed" && data.pull) setPull(data.pull);
      else if (res.status === 503) setNotice(m.githubSilent);
      else setNotice(action === "ship" ? m.mergeFailed : m.closeFailed);
    } catch {
      setNotice(m.noConnection);
    }
    setBusy(false);
    setConfirm(null);
  };

  const wrap = cx("se", "se-review", standalone && "se-review-standalone");

  if (problem === "signin")
    return (
      <div className={wrap}>
        <a href={`${base}/auth?return=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`} className="se-link">
          {m.signIn}
        </a>{" "}
        {m.signInToReview}
      </div>
    );
  if (problem) return <p className={cx(wrap, "se-muted se-p")}>{problem === "missing" ? m.noPull(pr) : m.githubSilent}</p>;
  if (!pull) return <p className={cx(wrap, "se-muted se-p")}>{m.loading}</p>;

  return (
    <div className={wrap}>
      <p className="se-eyebrow">
        PR #{pull.number} · {pull.state === "open" ? m.stateOpen : pull.state === "merged" ? m.stateMerged : m.stateClosed}
      </p>
      <p className={cx("se-title", standalone && "se-title-large")}>{pull.title}</p>
      {/* The agent's report, rendered server-side from the PR description with raw HTML escaped. */}
      <div className={cx("se-report", standalone ? "se-report-large" : "se-report-scroll")} dangerouslySetInnerHTML={{ __html: pull.html }} />
      <p className="se-p se-mt2">
        <a href={pull.url} target="_blank" rel="noreferrer" className="se-link">
          {m.onGitHub}
        </a>
      </p>
      {pull.state === "merged" && <p className="se-p se-mt3" style={{ color: "var(--se-accent-ink, #1e40af)" }}>{m.shipped}</p>}
      {pull.state === "closed" && <p className="se-p se-mt3 se-muted">{m.discarded}</p>}
      {notice && <p className="se-p se-mt3 se-error">{notice}</p>}
      {pull.state === "open" && pull.agent && (
        <div className="se-row se-mt3" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          {confirm ? (
            <>
              <span className="se-muted">{confirm === "ship" ? m.confirmShip : m.confirmDiscard}</span>
              <button type="button" className={cx("se-btn", confirm === "ship" ? "se-btn-primary" : "se-btn-danger")} disabled={busy} onClick={() => act(confirm)}>
                {busy ? m.working : confirm === "ship" ? m.yesShip : m.yesDiscard}
              </button>
              <button type="button" className="se-btn" disabled={busy} onClick={() => setConfirm(null)}>
                {m.no}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="se-btn se-btn-primary" disabled={busy} onClick={() => (standalone ? act("ship") : setConfirm("ship"))}>
                {busy ? m.shipping : m.ship}
              </button>
              <button type="button" className="se-btn se-btn-quiet-danger" onClick={() => setConfirm("discard")}>
                {m.discard}
              </button>
            </>
          )}
        </div>
      )}
      {pull.state === "open" && !pull.agent && <p className="se-p se-mt3 se-muted">{m.notAgentBranch}</p>}
    </div>
  );
}
