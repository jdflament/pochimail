import { expect, it, vi } from "vitest";
import { egressPolicy } from "../egress/allowlist.ts";
import { createHttpClient, type Fetch } from "../egress/http-client.ts";
import { createOAuthFetch } from "./http.ts";

const clientWith = (fetchImpl: Fetch) =>
  createHttpClient({ allowlist: egressPolicy.create(), fetch: fetchImpl });

const respond =
  (body: string): Fetch =>
  async () => ({
    status: 200,
    ok: true,
    text: async () => body,
  });

const hang: Fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
  });

it("refuses a host outside the egress allow-list before touching the network (guards a token posted to an unlisted host)", async () => {
  const transport = vi.fn(respond("{}"));
  const fetchLike = createOAuthFetch(clientWith(transport));
  await expect(fetchLike("https://evil.example/token", { method: "POST" })).rejects.toThrow(
    /allow-list/,
  );
  expect(transport).not.toHaveBeenCalled();
});

it("refuses an HTTP downgrade to an allowed host (guards a token sent in clear text)", async () => {
  const transport = vi.fn(respond("{}"));
  const fetchLike = createOAuthFetch(clientWith(transport));
  await expect(fetchLike("http://oauth2.googleapis.com/token", { method: "POST" })).rejects.toThrow(
    /HTTPS/,
  );
  expect(transport).not.toHaveBeenCalled();
});

it("times out a token endpoint that never answers (guards an exchange hanging past the sign-in window)", async () => {
  const fetchLike = createOAuthFetch(clientWith(hang), { timeoutMs: 20 });
  await expect(
    fetchLike("https://oauth2.googleapis.com/token", { method: "POST" }),
  ).rejects.toThrow(/timed out/);
});

it("aborts the request when the caller cancels (guards a cancelled sign-in leaving a socket open)", async () => {
  const controller = new AbortController();
  const fetchLike = createOAuthFetch(clientWith(hang));
  const pending = fetchLike("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toThrow(/cancelled/);
});

it("caps an oversized token response instead of accepting it (guards a hostile endpoint exhausting memory)", async () => {
  const fetchLike = createOAuthFetch(clientWith(respond("x".repeat(4096))), {
    maxResponseBytes: 128,
  });
  await expect(
    fetchLike("https://oauth2.googleapis.com/token", { method: "POST" }),
  ).rejects.toThrow(/size cap/);
});
