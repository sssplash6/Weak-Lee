// Serves a pay request's stored invoice PDF. The bytes live in Postgres
// (PayrollPdf) and are the canonical invoice for the submission's current
// snapshot — regenerated on resubmit, never on read, so what admins approved
// is byte-for-byte what everyone downloads later.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isFinance, isPayrollAdmin } from "@/lib/payroll";
import { payrollPeriodLabel } from "@/lib/payrollTypes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });

  const { id } = await params;
  const submission = await prisma.payrollSubmission.findUnique({
    where: { id },
    select: {
      userId: true,
      user: { select: { name: true } },
      period: { select: { year: true, month: true } },
      pdf: { select: { bytes: true } },
    },
  });
  if (!submission) return new Response("Not found", { status: 404 });

  // The owner, the admin stage, and the finance stage — nobody else (leads get
  // no payroll visibility into their members).
  const email = session.user.email;
  const allowed =
    submission.userId === session.user.id ||
    isPayrollAdmin(email) ||
    isFinance(email);
  if (!allowed) return new Response("Not authorized", { status: 403 });
  if (!submission.pdf) return new Response("No invoice generated", { status: 404 });

  const label = payrollPeriodLabel(submission.period.year, submission.period.month);
  const name = submission.user.name ?? "Invoice";
  // ASCII fallback plus RFC 5987 for names outside ASCII.
  const filename = `${name} — ${label}.pdf`;
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new Response(Buffer.from(submission.pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
