import { marked } from "marked";

/*
  The agent's report, as the review panel and the approve page show it: the PR description with
  the action's own header, the branch line and "Closes #N" removed, and its Markdown rendered. Raw
  HTML in the text is shown as text, so nothing in a description can run on the page. The preview
  email renders the same way.
*/
export function repliesHtml(body: string | null | undefined): string {
  let text = String(body ?? "");
  const rule = text.indexOf("\n---\n");
  if (rule !== -1 && /^\*\*Claude/.test(text.trim())) text = text.slice(rule + 5);
  text = text
    .replace(/^\s*·\s*branch\s+`[^`]*`\s*$/gm, "")
    .replace(/^\s*Closes #\d+\s*$/gm, "")
    .replace(/^(\s*[-*]\s+)\[x\]\s+/gim, "$1✓ ")
    .replace(/^(\s*[-*]\s+)\[ \]\s+/gm, "$1○ ")
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .trim();
  return marked.parse(text || "No replies.", { gfm: true, breaks: false, async: false }) as string;
}
