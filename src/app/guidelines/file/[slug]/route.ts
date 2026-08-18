import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { canReadGuide, GUIDELINES_DIR, guideBySlug } from "@/lib/guidelines";

/**
 * Serves a guideline PDF to a signed-in user. The documents sit in
 * private/guidelines rather than public/ precisely so this check can't be
 * side-stepped: a file under public/ is a static asset and would download for
 * anyone with the URL.
 *
 * The slug only ever selects an entry from the guide catalogue — it is never
 * joined into a path — so no request can walk out of the directory.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/guidelines/file/[slug]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Sign in to read the guidelines.", { status: 401 });
  }

  const { slug } = await ctx.params;
  const guide = guideBySlug(slug);
  if (!guide) return new Response("No such guide.", { status: 404 });

  // Department-scoped guides: the card is rendered locked, but the URL has to be
  // closed too, or "locked" means nothing.
  if (guide.departments != null) {
    const viewer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        memberships: { select: { department: { select: { name: true } } } },
      },
    });
    const allowed = canReadGuide(guide, {
      departments: viewer?.memberships.map((m) => m.department.name),
      isAdmin: isAdmin(session.user.email),
    });
    if (!allowed) {
      return new Response(
        `This guide is for the ${guide.departments[0]} department.`,
        { status: 403 },
      );
    }
  }

  let file: Buffer;
  try {
    file = await readFile(path.join(process.cwd(), ...GUIDELINES_DIR, guide.pdf));
  } catch {
    return new Response("That guide is missing on the server.", { status: 404 });
  }

  const download = request.nextUrl.searchParams.has("dl");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `${
        download ? "attachment" : "inline"
      }; filename="${guide.pdf}"`,
      // Internal documents: keep them out of shared/CDN caches entirely.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
