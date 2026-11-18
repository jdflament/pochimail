import { createContext, type ReactNode, useContext } from "react";
import {
  createOptimisticActionRegistry,
  type OptimisticActionRegistry,
} from "./query/optimistic.ts";

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
  return <OptimisticContext.Provider value={registry}>{children}</OptimisticContext.Provider>;
}

export const createDefaultOptimisticRegistry = (): OptimisticActionRegistry =>
  createOptimisticActionRegistry();
