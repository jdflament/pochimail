import type { CancelSignal } from "@pochimail/kernel/common";

/** Bounded-concurrency primitives for the job runner: a permit gate and an async queue. */
export class Gate {
  private free: number;
  private waiters: ((granted: boolean) => void)[] = [];
  private closed = false;
  constructor(permits: number) {
    this.free = permits;
  }
  acquire(signal: CancelSignal): Promise<boolean> {
    if (signal.aborted || this.closed) return Promise.resolve(false);
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve(false);
      };
      const wake = (granted: boolean) => {
        signal.removeEventListener("abort", onAbort);
        resolve(granted);
      };
      this.waiters.push(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next(true);
    else this.free += 1;
  }
  close(): void {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w(false);
  }
}

export class Queue<V> {
  private items: V[] = [];
  private takers: ((v: V | undefined) => void)[] = [];
  private closed = false;
  push(v: V): void {
    const taker = this.takers.shift();
    if (taker) taker(v);
    else this.items.push(v);
  }
  take(): Promise<V | undefined> {
    const v = this.items.shift();
    if (v !== undefined) return Promise.resolve(v);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => this.takers.push(resolve));
  }
  close(): void {
    this.closed = true;
    for (const t of this.takers.splice(0)) t(undefined);
  }
}
