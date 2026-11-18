import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/queue/inline-drain";

// Fallback sweep (added by insta-autodm). Call it every minute from a Google
// Sheet's Apps Script timer, or from cron-job.org, with
// Authorization: Bearer <CRON_SECRET>. It sends anything the webhook missed.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await drainQueue();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = GET;
