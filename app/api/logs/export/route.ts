/**
 * DM log export (added by the insta-autodm setup app).
 *
 * GET /api/logs/export?status=SENT&instagramAccountId=...
 * Returns every DM log of the signed-in workspace as a CSV file that opens
 * cleanly in Google Sheets (File → Import → Upload) and Excel.
 * Same filters as /api/logs, newest first.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { DmStatus } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

const BATCH = 1000;
const MAX_ROWS = 100_000;

const HEADER = [
  "time_utc",
  "instagram_account",
  "commenter",
  "commenter_id",
  "comment",
  "matched_keyword",
  "campaign",
  "status",
  "dm_sent_at_utc",
  "public_reply_sent_at_utc",
  "error",
];

/** Quote a cell; neutralise text that a spreadsheet would run as a formula. */
function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const instagramAccountId = searchParams.get("instagramAccountId");
  const parsedStatus =
    status && Object.values(DmStatus).includes(status as DmStatus)
      ? (status as DmStatus)
      : null;

  const where = {
    workspaceId,
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(instagramAccountId && instagramAccountId !== "all"
      ? { instagramAccountId }
      : {}),
  };

  const lines: string[] = [HEADER.map(csvCell).join(",")];
  let cursor: string | undefined;
  let total = 0;

  while (total < MAX_ROWS) {
    const batch = await prisma.dmLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(BATCH, MAX_ROWS - total),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        automation: { select: { name: true } },
        instagramAccount: { select: { username: true } },
      },
    });
    for (const log of batch) {
      lines.push(
        [
          log.createdAt,
          log.instagramAccount?.username,
          log.commenterName,
          log.commenterId,
          log.commentText,
          log.matchedKeyword,
          log.automation?.name,
          log.status,
          log.dmSentAt,
          log.publicReplySentAt,
          log.errorMessage ?? log.publicReplyError,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    total += batch.length;
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }

  const day = new Date().toISOString().slice(0, 10);
  // BOM so Excel reads emoji and Hindi correctly; Google Sheets ignores it.
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dm-log-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
