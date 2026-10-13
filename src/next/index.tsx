"use client";

import { usePathname, useRouter } from "next/navigation";
import { SiteEdit as Base, type SiteEditProps, type SiteEditTheme } from "../client/SiteEdit";

/*
  The widget wired to Next's App Router: the current path from usePathname, so pins and comment
  mode follow client-side navigation, and router.push for jumping to a note on another page.
  Mount it once in the root layout:

    <SiteEdit pr={process.env.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID} branch={process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF} locales={["en", "es"]} />
*/
export function SiteEdit(props: Omit<SiteEditProps, "pathname" | "onNavigate">) {
  const pathname = usePathname();
  const router = useRouter();
  return <Base {...props} pathname={pathname} onNavigate={(path) => router.push(path)} />;
}

export { ReviewPanel, type ReviewPanelProps } from "../client/ReviewPanel";
export type { SiteEditProps, SiteEditTheme };
