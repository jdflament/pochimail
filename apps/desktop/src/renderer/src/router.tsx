import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { OverviewPage } from "./features/overview/overview-page.tsx";

const rootRoute = createRootRoute({ component: Outlet });
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage });

// File-based loading (file://) has no server to resolve paths, so the router uses in-memory history.
export const router = createRouter({
  routeTree: rootRoute.addChildren([overviewRoute]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
