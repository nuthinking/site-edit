import { createSiteEdit } from "@nuthinking/site-edit/server";

/*
  Every site-edit endpoint, on one catch-all route: app/api/site-edit/[...path]/route.ts.
  Secrets come from the environment (SITE_EDIT_REPO, SITE_EDIT_GITHUB_CLIENT_ID,
  SITE_EDIT_GITHUB_CLIENT_SECRET, SITE_EDIT_SECRET, SITE_EDIT_SITE_URL, SITE_EDIT_PREVIEW_PREFIX).
  Installed by the site-edit skill.
*/
export const { GET, POST, DELETE } = createSiteEdit({
  // SITE-EDIT: the site's locales when its URLs start with one, e.g. ["en", "es"]; [] otherwise.
  locales: [],
  // SITE-EDIT: where a page's code lives, so the agent starts in the right file.
  pageFiles: (path) => [`app${path === "/" ? "" : path}/page.tsx`],
});
