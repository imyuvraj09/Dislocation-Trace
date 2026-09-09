/**
 * Barrel export for the reusable image workspace module.
 *
 * `ImageViewer` is the fully-composed workspace; everything else is
 * independently reusable (e.g. a future inline per-stage preview might
 * import just `ImageViewport` + `ZoomControls`).
 */
export { default as ImageViewer } from "@/components/image/ImageViewer";
export { default as ImageViewport } from "@/components/image/ImageViewport";
export { default as ImageToolbar } from "@/components/image/ImageToolbar";
export { default as ImageBrowser } from "@/components/image/ImageBrowser";
export { default as LayerManager } from "@/components/image/LayerManager";
export { default as ZoomControls } from "@/components/image/ZoomControls";
export { default as StatusBar } from "@/components/image/StatusBar";
export { default as MiniMap } from "@/components/image/MiniMap";
export { default as Histogram } from "@/components/image/Histogram";
export { default as ScaleBar } from "@/components/image/ScaleBar";
export { default as InspectorPanel } from "@/components/image/InspectorPanel";

// Rendering pipeline (see components/image/rendering/*.js).
export { default as CanvasRenderer } from "@/components/image/rendering/CanvasRenderer";
export { default as LayerRenderer } from "@/components/image/rendering/LayerRenderer";
export { default as OverlayRenderer } from "@/components/image/rendering/OverlayRenderer";

// Workspace layout shell (see components/image/layout/*.js).
export { default as WorkspaceLayout } from "@/components/image/layout/WorkspaceLayout";
