import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";

const { state, processJobMock, heartbeatMock } = vi.hoisted(() => {
  const state = {
    jobs: [] as any[],
    queueAdds: [] as any[],
    locks: new Set<string>(),
    lockBlocked: new Set<string>(),
  };
  return {
    state,
    processJobMock: vi.fn(),
    heartbeatMock: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({
    getJobs: async () => state.jobs,
    add: async (name: string, data: unknown, opts: unknown) => {
      state.queueAdds.push({ name, data, opts });
    },
  }),
  getRedisConnection: () => ({
    set: async (key: string) => {
      if (state.lockBlocked.has(key)) return null;
      state.locks.add(key);
      return "OK";
    },
    del: async (key: string) => {
      state.locks.delete(key);
      return 1;
    },
  }),
}));
vi.mock("@/lib/queue/dm-worker", () => ({ processJob: processJobMock }));
vi.mock("@/lib/ops/worker-health", () => ({ recordWorkerHeartbeat: heartbeatMock }));

import { MAX_JOB_ATTEMPTS, RETRY_DELAYS_MS, drainQueue } from "@/lib/queue/inline-drain";

function job(id: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "process-comment",
    data: { instagramAccountId: "acc", commentId: id, ...data },
    timestamp: Date.now() - 1000,
    opts: {},
    remove: vi.fn(async () => undefined),
    ...extra,
  };
}

beforeEach(() => {
  state.jobs = [];
  state.queueAdds = [];
  state.locks.clear();
  state.lockBlocked.clear();
  processJobMock.mockReset();
  heartbeatMock.mockClear();
});

describe("drainQueue", () => {
  it("runs a due job and removes it on success", async () => {
    const j = job("c1");
    state.jobs = [j];
    processJobMock.mockResolvedValueOnce(undefined);

    const r = await drainQueue();

    expect(processJobMock).toHaveBeenCalledWith(j);
    expect(j.remove).toHaveBeenCalledOnce();
    expect(r.processed).toBe(1);
    expect(state.queueAdds).toHaveLength(0);
    expect(state.locks.size).toBe(0); // lock released
    expect(heartbeatMock).toHaveBeenCalledOnce();
  });

  it("re-queues a failed job with the first retry delay", async () => {
    const j = job("c2");
    state.jobs = [j];
    processJobMock.mockRejectedValueOnce(new Error("Meta 500"));

    const r = await drainQueue();

    expect(r.retried).toBe(1);
    expect(j.remove).toHaveBeenCalledOnce();
    expect(state.queueAdds).toEqual([
      {
        name: "process-comment",
        data: expect.objectContaining({ commentId: "c2", drainAttempts: 1 }),
        opts: { jobId: "c2", delay: RETRY_DELAYS_MS[0] },
      },
    ]);
  });

  it("uses the next retry delay on later attempts", async () => {
    const j = job("c3", { drainAttempts: 1 });
    state.jobs = [j];
    processJobMock.mockRejectedValueOnce(new Error("rate limited"));

    await drainQueue();

    expect(state.queueAdds[0].data.drainAttempts).toBe(2);
    expect(state.queueAdds[0].opts.delay).toBe(RETRY_DELAYS_MS[1]);
  });

  it("gives up after the last attempt and does not re-queue", async () => {
    const j = job("c4", { drainAttempts: MAX_JOB_ATTEMPTS - 1 });
    state.jobs = [j];
    processJobMock.mockRejectedValueOnce(new Error("still failing"));

    const r = await drainQueue();

    expect(r.failed).toBe(1);
    expect(r.retried).toBe(0);
    expect(j.remove).toHaveBeenCalledOnce();
    expect(state.queueAdds).toHaveLength(0);
  });

  it("never retries an unrecoverable error (the DM may already have been sent)", async () => {
    const j = job("c5");
    state.jobs = [j];
    processJobMock.mockRejectedValueOnce(new UnrecoverableError("delivery unconfirmed"));

    const r = await drainQueue();

    expect(r.failed).toBe(1);
    expect(state.queueAdds).toHaveLength(0);
  });

  it("leaves a job alone until its delay has passed", async () => {
    const j = job("c6", {}, { timestamp: Date.now(), opts: { delay: 60 * 60_000 } });
    state.jobs = [j];

    const r = await drainQueue();

    expect(processJobMock).not.toHaveBeenCalled();
    expect(r.skippedNotDue).toBe(1);
    expect(j.remove).not.toHaveBeenCalled();
  });

  it("skips a job another run is already handling", async () => {
    const j = job("c7");
    state.jobs = [j];
    state.lockBlocked.add("lock:dm-job:c7");

    const r = await drainQueue();

    expect(processJobMock).not.toHaveBeenCalled();
    expect(r.skippedLocked).toBe(1);
  });

  it("stops when the time budget is used up, leaving the rest queued", async () => {
    state.jobs = [job("a"), job("b")];
    processJobMock.mockResolvedValue(undefined);

    const r = await drainQueue({ budgetMs: -1 });

    expect(r.budgetExhausted).toBe(true);
    expect(processJobMock).not.toHaveBeenCalled();
  });

  it("keeps going after one job fails", async () => {
    state.jobs = [job("x"), job("y")];
    processJobMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);

    const r = await drainQueue();

    expect(r.retried).toBe(1);
    expect(r.processed).toBe(1);
  });
});
