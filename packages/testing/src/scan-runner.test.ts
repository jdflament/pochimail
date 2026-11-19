import type { AccountId } from "@pochimail/core/ids";
import type { RunScan, RunScanOutcome } from "@pochimail/core/use-cases/run-scan";
import { ScanRunner } from "@pochimail/core/use-cases/scan-runner";
import { StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_1, makeAccount, WS_A } from "./fixtures.ts";
import { createInMemoryUnitOfWork } from "./in-memory-store.ts";

type Execute = RunScan["execute"];

const setup = async (execute: Execute) => {
  const store = createInMemoryUnitOfWork();
  await store.uow.run((tx) => tx.repositories.accounts.save(makeAccount()));
  let jobs = 0;
  const scanFor = vi.fn(() => ({ execute }) as unknown as RunScan);
  const runner = new ScanRunner({
    uow: store.uow,
    workspaceId: WS_A,
    newJobId: () => `job-${++jobs}`,
    scanFor,
  });
  return { runner, scanFor };
};

describe("ScanRunner", () => {
  it("two starts for one account that arrive together make one job and one run (guards a double click scanning twice)", async () => {
    const execute = vi.fn<Execute>(async () => ok({ status: "completed", processed: 1 }));
    const { runner, scanFor } = await setup(execute);
    const [first, second] = await Promise.all([runner.start(ACCOUNT_1), runner.start(ACCOUNT_1)]);
    await runner.idle();
    expect(first).toEqual(second);
    expect(scanFor).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("resume right after pause waits for the paused run to settle, so two runs never overlap (guards two runs advancing one cursor)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const starts: (number | undefined)[] = [];
    const execute: Execute = async (request) => {
      starts.push(request.processedBefore);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const first = starts.length === 1;
      if (first) await gate; // the first run is still finishing its batch when resume arrives
      inFlight -= 1;
      const outcome: RunScanOutcome = first
        ? { status: "paused", processed: 5 }
        : { status: "completed", processed: 9 };
      return ok(outcome);
    };
    const { runner } = await setup(execute);
    const started = await runner.start(ACCOUNT_1);
    if (!started.ok) throw started.error;
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    runner.pause(started.value.jobId);
    runner.resume(started.value.jobId);
    release();
    await runner.idle();
    expect(maxInFlight).toBe(1);
    expect(starts).toEqual([0, 5]); // the second run continues from what the first one counted
  });

  it("a failed run can be started again and does not block the account (guards a stuck failed job)", async () => {
    let calls = 0;
    const execute: Execute = async () => {
      calls += 1;
      return calls === 1 ? err(new StorageError()) : ok({ status: "completed", processed: 1 });
    };
    const { runner } = await setup(execute);
    const first = await runner.start(ACCOUNT_1);
    await runner.idle();
    const second = await runner.start(ACCOUNT_1);
    await runner.idle();
    expect(first.ok && second.ok && first.value.jobId !== second.value.jobId).toBe(true);
    expect(calls).toBe(2);
  });

  it("an unknown account is NotFound and leaves no job behind (guards a phantom job for a missing account)", async () => {
    const { runner, scanFor } = await setup(async () => ok({ status: "completed", processed: 0 }));
    const missing = await runner.start("acc-missing" as AccountId);
    expect(missing.ok).toBe(false);
    expect(scanFor).not.toHaveBeenCalled();
  });
});
