import { useSyncExternalStore } from "react";
import {
  getTools,
  getActiveToolId,
  setActiveToolId,
  subscribeTools,
  subscribeActiveTool,
} from "@/services/toolRegistry";

/**
 * Reactive binding onto the Tool Registry: the sorted list of registered
 * tools, which one is active, and a setter. Unlike `useViewport`/
 * `useLayers`, this isn't scoped to a single image -- "which tool is
 * selected" is workspace-wide UI state, not per-image project data.
 */
export function useToolRegistry() {
  const tools = useSyncExternalStore(subscribeTools, getTools, getTools);
  const activeToolId = useSyncExternalStore(subscribeActiveTool, getActiveToolId, getActiveToolId);
  return { tools, activeToolId, setActiveToolId };
}

export default useToolRegistry;
