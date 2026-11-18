import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { OptimisticActionRegistry } from "./query/optimistic.ts";

const OptimisticContext = createContext<OptimisticActionRegistry | null>(null);

export const useOptimisticRegistry = (): OptimisticActionRegistry => {
  const registry = useContext(OptimisticContext);
  if (registry === null) throw new Error("optimistic action registry is not available");
  return registry;
};

export function OptimisticActionProvider({
  children,
  registry,
}: {
  children: ReactNode;
  registry: OptimisticActionRegistry;
}) {
  useEffect(() => {
    return () => {
      registry.dispose();
    };
  }, [registry]);
  return <OptimisticContext.Provider value={registry}>{children}</OptimisticContext.Provider>;
}
