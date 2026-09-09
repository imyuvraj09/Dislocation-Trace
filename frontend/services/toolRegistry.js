import { BUILTIN_TOOLS, DEFAULT_TOOL_ID } from "@/constants/tools";

/**
 * The Tool Registry.
 *
 * A plain module-level store -- deliberately NOT the Zustand Project
 * Store, since which tool is registered/active is workspace UI state, not
 * project data that should be saved/loaded with a project (it doesn't
 * belong in models/project.js). It's a small external store instead,
 * exposed to React via hooks/useToolRegistry.js's `useSyncExternalStore`.
 *
 * This module registers the eight built-in viewport tools at load time.
 * Phase 3's annotation tools register themselves the same way, via
 * `registerTool` -- the toolbar (components/image/ImageToolbar.js) renders
 * whatever's currently registered without needing to know about any
 * specific tool ahead of time.
 */
const registry = new Map();
let activeToolId = DEFAULT_TOOL_ID;
let toolsCache = [];

const toolListeners = new Set();
const activeToolListeners = new Set();

function rebuildCache() {
  toolsCache = [...registry.values()].sort((a, b) => a.order - b.order);
}

function notifyTools() {
  toolListeners.forEach((listener) => listener());
}

function notifyActiveTool() {
  activeToolListeners.forEach((listener) => listener());
}

/** Adds (or replaces, by id) a tool descriptor: `{id, label, icon, kind, order, ...}`. */
export function registerTool(tool) {
  registry.set(tool.id, tool);
  rebuildCache();
  notifyTools();
}

/** Removes a tool. If it was the active tool, falls back to {@link DEFAULT_TOOL_ID}. */
export function unregisterTool(id) {
  registry.delete(id);
  rebuildCache();
  notifyTools();
  if (activeToolId === id) {
    activeToolId = DEFAULT_TOOL_ID;
    notifyActiveTool();
  }
}

/** A stable-reference snapshot (for `useSyncExternalStore`) -- only recomputed on register/unregister. */
export function getTools() {
  return toolsCache;
}

export function getTool(id) {
  return registry.get(id);
}

export function getActiveToolId() {
  return activeToolId;
}

/** Sets the active tool. No-ops for an id that isn't registered. */
export function setActiveToolId(id) {
  if (!registry.has(id) || activeToolId === id) return;
  activeToolId = id;
  notifyActiveTool();
}

export function subscribeTools(listener) {
  toolListeners.add(listener);
  return () => toolListeners.delete(listener);
}

export function subscribeActiveTool(listener) {
  activeToolListeners.add(listener);
  return () => activeToolListeners.delete(listener);
}

// Register the built-ins once, at module load.
BUILTIN_TOOLS.forEach(registerTool);
