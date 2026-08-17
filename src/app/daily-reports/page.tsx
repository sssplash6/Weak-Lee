import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { isDailyReporter } from "@/lib/dailyReports";
import { ReporterView } from "./_components/ReporterView";
import { ReviewView } from "./_components/ReviewView";

export const metadata: Metadata = { title: "Daily reports" };

/**
 * One address, two sides: reporters write here, the recipient (and other
 * admins) read here. Anyone else has nothing on this page and goes back to
 * their dashboard.
 */
export default async function DailyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const email = session.user.email;
  const reporter = isDailyReporter(email);
  const admin = isAdmin(email);
  const sp = await searchParams;

  // An admin who also reports (e.g. tech@) lands on their composer; the team
  // view stays one click away (?view=review) and any calendar navigation
  // (?m/?d) keeps them on it.
  const wantsReview =
    sp.view === "review" ||
    typeof sp.m === "string" ||
    typeof sp.d === "string";

  if (admin && (wantsReview || !reporter)) {
    return (
      <ReviewView
        monthParam={typeof sp.m === "string" ? sp.m : undefined}
        dayParam={typeof sp.d === "string" ? sp.d : undefined}
      />
    );
  }
  if (reporter) {
    return <ReporterView userId={session.user.id} showReviewLink={admin} />;
  }
  redirect("/dashboard");
}
