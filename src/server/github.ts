/* GitHub, with the signed-in user's own token: access checks, the user's address, and the agent's pull requests. */
export const api = "https://api.github.com";

export function github(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

/**
 * The user's write access to the repository, straight from GitHub: true, false when GitHub says
 * the token or the access is gone (401, 403 on the repo, 404), or null when GitHub could not be
 * asked (network, 5xx, rate limit), which is not a reason to sign anyone out.
 */
export async function hasWriteAccess(token: string, repo: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${api}/repos/${repo}`, { headers: github(token), cache: "no-store" });
    if (res.ok) return ((await res.json()) as { permissions?: { push?: boolean } }).permissions?.push === true;
    if (res.status === 401 || res.status === 404) return false;
    if (res.status === 403 && !res.headers.get("x-ratelimit-remaining")?.startsWith("0")) return false;
    return null;
  } catch {
    return null;
  }
}

export async function githubLogin(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${api}/user`, { headers: github(token), cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { login: string }).login ?? null;
  } catch {
    return null;
  }
}

/** The user's primary verified address, for the preview email; null when GitHub cannot say. */
export async function githubEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${api}/user/emails`, { headers: github(token), cache: "no-store" });
    if (!res.ok) return null;
    const list = (await res.json()) as { email: string; primary: boolean; verified: boolean }[];
    return list.find((e) => e.primary && e.verified)?.email ?? list.find((e) => e.verified)?.email ?? null;
  } catch {
    return null;
  }
}

export type Pull = { number: number; title: string; body: string | null; state: "open" | "closed"; merged: boolean; html_url: string; head: { ref: string; sha: string } };

export async function getPull(token: string, repo: string, number: number): Promise<Pull | null> {
  try {
    const res = await fetch(`${api}/repos/${repo}/pulls/${number}`, { headers: github(token), cache: "no-store" });
    return res.ok ? ((await res.json()) as Pull) : null;
  } catch {
    return null;
  }
}

async function deleteBranch(token: string, repo: string, ref: string): Promise<void> {
  try {
    await fetch(`${api}/repos/${repo}/git/refs/heads/${ref}`, { method: "DELETE", headers: github(token) });
  } catch {}
}

/**
 * Squash-merges the PR as the signed-in user (one commit on the default branch per request), then
 * removes the branch. `sha` is the commit the editor was shown: GitHub refuses ("moved") if the
 * branch has moved on since, so nothing ships unseen.
 */
export async function shipPull(token: string, repo: string, pull: Pull, sha: string): Promise<"merged" | "moved" | "failed"> {
  try {
    const res = await fetch(`${api}/repos/${repo}/pulls/${pull.number}/merge`, {
      method: "PUT",
      headers: { ...github(token), "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "squash", commit_title: `${pull.title} (#${pull.number})`, sha }),
    });
    if (res.status === 409) return "moved";
    if (!res.ok) return "failed";
    await deleteBranch(token, repo, pull.head.ref);
    return "merged";
  } catch {
    return "failed";
  }
}

/** Closes the PR unmerged and removes the branch; the linked issue stays open for a new attempt. */
export async function discardPull(token: string, repo: string, pull: Pull): Promise<boolean> {
  try {
    const res = await fetch(`${api}/repos/${repo}/pulls/${pull.number}`, {
      method: "PATCH",
      headers: { ...github(token), "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    });
    if (!res.ok) return false;
    await deleteBranch(token, repo, pull.head.ref);
    return true;
  } catch {
    return false;
  }
}
