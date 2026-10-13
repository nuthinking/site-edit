## Editing from the site

Editors leave notes on the live site or on a preview; each batch arrives as a GitHub issue (or a comment on the pull request a preview belongs to) that mentions you, with one numbered section per note and its context: the page, the component (`data-component`), the element's tag, class string and text, and whether the note is about all languages or this one. Make the change on your branch and report.

- **One request, one PR.** When a request is a numbered list, answer each number in your final report as done, done with a note, or a question; that report becomes the PR description. Ask rather than guess when a request is ambiguous about which text or which language.
- **The report is read by the editors, not by developers**, on the site's review page and in an email. Write it as plain sentences about the site: which page and section changed, the old text and the new. No file paths, no keys, no commands, no mention of checks passing, no headings. One short paragraph or list item per number.
- **To find the element**, search the source for its class string (class lists are literal in the source) or its `data-component` name, which is the component's file name.
- **Copy lives in** <!-- SITE-EDIT: where copy lives, e.g. `src/content/en.ts` and `es.ts` -->. Never hard-code text in components. To find the source of text seen on a page, search those files for the exact string.
- **Languages:** <!-- SITE-EDIT: the site's language rule, e.g. "English is the source; a change requested on an English page changes both languages; a change on a Spanish page changes only the Spanish." Delete this line on a single-language site. -->
- **Before finishing**, run <!-- SITE-EDIT: the project's check command, e.g. `pnpm check` -->. Do not add dependencies without saying so in the report.
- **Tone:** <!-- SITE-EDIT: the site's writing rules, if any -->
