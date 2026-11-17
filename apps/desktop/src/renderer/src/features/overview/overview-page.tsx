import { useEffect, useState } from "react";
import { connectWorker } from "../../lib/worker.ts";

type WorkerState = "connecting" | "connected" | "unavailable";

export function OverviewPage() {
  const [worker, setWorker] = useState<WorkerState>("connecting");

  useEffect(() => {
    let cancelled = false;
    void connectWorker()
      .then((client) => client.echo("ping"))
      .then((reply) => !cancelled && setWorker(reply === "ping" ? "connected" : "unavailable"))
      .catch(() => !cancelled && setWorker("unavailable"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl">Overview</h1>
      <p className="mt-4 text-muted-foreground">
        Everything stays on this device. Nothing is sent anywhere.
      </p>
      <p role="status" aria-live="polite" className="mt-8 text-sm text-foreground-tertiary">
        {worker === "connecting" && "Starting the background worker…"}
        {worker === "connected" && "Background worker ready."}
        {worker === "unavailable" && "The background worker is not responding."}
      </p>
    </main>
  );
}
