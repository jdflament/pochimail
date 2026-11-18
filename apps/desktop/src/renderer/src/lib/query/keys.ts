/** Query keys for worker-backed data. Centralized so subscriptions can update the same caches without refetching. */
export const queryKeys = {
  appState: () => ["app", "state"] as const,
  accounts: () => ["accounts", "list"] as const,
  overview: () => ["overview"] as const,
  digest: () => ["digest"] as const,
  settings: () => ["settings"] as const,
  scanProgress: (accountId: string) => ["scan", "progress", accountId] as const,
};
