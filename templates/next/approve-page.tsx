import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewPanel } from "@nuthinking/site-edit/next";

/*
  The page the preview email links to: one of the agent's pull requests, with Ship and Discard.
  Path: app/admin/approve/[pr]/page.tsx (under the locale segment on a localised site). Nothing
  merges on opening the page, only on the button, since mail clients open links on their own.
  Without a session the panel shows a sign-in link. Installed by the site-edit skill.
*/
type Props = { params: Promise<{ pr: string }> };

export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };

export default async function ApprovePage({ params }: Props) {
  const { pr } = await params;
  if (!/^\d{1,7}$/.test(pr)) notFound();
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 16px" }}>
      <ReviewPanel pr={pr} standalone />
    </main>
  );
}
