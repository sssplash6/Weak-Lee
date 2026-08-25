// Serves one expense receipt (bytes live in Postgres — see PayrollReceipt).
// Same audience as the invoice PDF: the owner and the two review stages.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isFinance, isPayrollAdmin } from "@/lib/payroll";
import { isPayrollOpenFor } from "@/lib/payrollTypes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  // Payroll off, or this account isn't in the restricted rollout yet.
  if (!isPayrollOpenFor(session.user.email)) {
    return new Response("Payroll is closed", { status: 404 });
  }

  const { id } = await params;
  const receipt = await prisma.payrollReceipt.findUnique({
    where: { id },
    select: {
      bytes: true,
      filename: true,
      mimeType: true,
      expense: { select: { submission: { select: { userId: true } } } },
    },
  });
  if (!receipt) return new Response("Not found", { status: 404 });

  const email = session.user.email;
  const allowed =
    receipt.expense.submission.userId === session.user.id ||
    isPayrollAdmin(email) ||
    isFinance(email);
  if (!allowed) return new Response("Not authorized", { status: 403 });

  const ascii = receipt.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(Buffer.from(receipt.bytes), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(receipt.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
