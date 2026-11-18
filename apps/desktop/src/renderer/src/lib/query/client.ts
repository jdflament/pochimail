import { QueryClient } from "@tanstack/react-query";

/** Renderer query client: worker subscriptions push updates, so queries must not poll or refetch on their own. */
export const createAppQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
