/**
 * Runs queued DM jobs without a separate worker (added by insta-autodm).
 *
 * The webhook queues each comment as before, then calls drainQueue() after it
 * has answered Meta. The sweep endpoint /api/cron/drain-queue calls it too, so
 * anything the webhook missed (a timeout, a retry that came due, or a rate-limit
 * requeue) still runs within about a minute.
 *
 * Retries: a failed job is re-queued up to MAX_JOB_ATTEMPTS times, with the same
 * gaps the worker used. An UnrecoverableError (a send that may already have
 * reached Instagram) is never retried, so nobody gets the same DM twice.
 *
 * Duplicates: a short Redis lock per job stops the webhook and the sweep from
 * running one job at the same time. processComment also claims each comment in
 * Postgres before sending, so a rare double run still cannot send twice.
 */
import { UnrecoverableError, type Job } from "bullmq";
import { getDMQueue, getRedisConnection, type DmQueueJob } from "@/lib/queue/client";
import { processJob } from "@/lib/queue/dm-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";

export const MAX_JOB_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 45 * 60_000];
const LOCK_TTL_MS = 120_000;
const DEFAULT_BUDGET_MS = 240_000; // stay under the 300 s Vercel Hobby limit
const MAX_JOBS_PER_RUN = 200;

export interface DrainResult {
  checked: number;
  processed: number;
  retried: number;
  failed: number;
  skippedLocked: number;
  skippedNotDue: number;
  budgetExhausted: boolean;
}

function dueAt(job: Job<DmQueueJob>): number {
  return (job.timestamp ?? 0) + (job.opts?.delay ?? 0);
}

export async function drainQueue(
  options: { budgetMs?: number } = {}
): Promise<DrainResult> {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const result: DrainResult = {
    checked: 0,
    processed: 0,
    retried: 0,
    failed: 0,
    skippedLocked: 0,
    skippedNotDue: 0,
    budgetExhausted: false,
  };

  const redis = getRedisConnection();
  const queue = getDMQueue();
  const jobs = (await queue.getJobs(
    ["waiting", "prioritized", "delayed"],
    0,
    MAX_JOBS_PER_RUN - 1,
    true
  )) as Job<DmQueueJob>[];

  for (const job of jobs) {
    if (Date.now() - startedAt > budgetMs) {
      result.budgetExhausted = true;
      break;
    }
    result.checked++;

    if (dueAt(job) > Date.now()) {
      result.skippedNotDue++;
      continue;
    }

    const lockKey = `lock:dm-job:${job.id}`;
    const locked = await redis.set(lockKey, String(process.pid), "PX", LOCK_TTL_MS, "NX");
    if (!locked) {
      result.skippedLocked++;
      continue;
    }

    try {
      await processJob(job);
      await job.remove();
      result.processed++;
    } catch (error) {
      await job.remove();
      const tries = (job.data.drainAttempts ?? 0) + 1;
      if (error instanceof UnrecoverableError || tries >= MAX_JOB_ATTEMPTS) {
        result.failed++;
      } else {
        await queue.add(
          job.name,
          { ...job.data, drainAttempts: tries },
          { jobId: job.id, delay: RETRY_DELAYS_MS[tries - 1] }
        );
        result.retried++;
      }
    } finally {
      await redis.del(lockKey);
    }
  }

  await recordWorkerHeartbeat({ pid: process.pid, hostname: "vercel-drain" }).catch(() => undefined);
  return result;
}
