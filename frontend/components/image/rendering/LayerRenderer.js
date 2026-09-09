import { memo } from "react";
import useStage from "@/hooks/useStage";
import { isActiveLine, isActiveGVector } from "@/lib/annotations";

const DETECTED_FALLBACK_COLOR = "#22C55E"; // used only if a detected line has no backend color
const MANUAL_LINE_COLOR = "#3B82F6"; // dashed blue
const DETECTED_GVECTOR_COLOR = "#A78BFA"; // violet
const MANUAL_GVECTOR_COLOR = "#3B82F6"; // dashed blue, same convention as manual lines
const SELECTED_COLOR = "#F97316"; // orange
const PENDING_COLOR = "#F472B6";
const MANUAL_DASH = "10 6";

/**
 * Paints every non-base layer, bottom-to-top, honoring each layer's
 * visibility/opacity/blendMode. Lives inside the same zoom/pan/rotate-
 * transformed box as `CanvasRenderer` (see `ImageViewport`), so its
 * content stays pixel-aligned with the base image.
 *
 * Branches by `imageType`:
 *  - TEM: "Detection"/"Annotation" layers render dislocation lines from
 *    `project.stages[1].temImages`. A detected line uses the backend's own
 *    per-line `color` (it already assigns each detected line a distinct
 *    color to tell them apart -- see fileskh/pipeline_types.py's
 *    DetectedLine.color -- so this just honors that instead of flattening
 *    everything to one color). A manual line is always dashed blue.
 *  - Diffraction: the same two layers render g-vectors from
 *    `project.stages[1].diffImages`, each labeled with its g_id and,
 *    once assigned, its Miller index from Stage 2
 *    (`project.stages[2].millerIndexByGvector`) -- read live from the
 *    store here rather than passed in, so a Miller index entered in
 *    Stage 2 shows up in the Workspace immediately.
 *
 * Deleted lines/g-vectors are never rendered here at all (not even
 * faded) -- "deleted" means gone from every view. `hiddenLineIds` is the
 * separate, purely-cosmetic "temporarily decluttered" toggle.
 *
 * A selected annotation (either kind) always renders in orange.
 *
 * @param {{
 *   layers: import("@/models/layer").Layer[],
 *   imageBasename: string,
 *   imageType: "TEM"|"Diffraction"|undefined,
 *   width: number,
 *   height: number,
 *   hiddenLineIds: Set<string>,
 *   selectedLineId: string|null,
 *   onAnnotationClick?: (id: string) => void,
 *   pendingPoint: {x: number, y: number}|null,
 *   livePreviewPoint: {x: number, y: number}|null,
 * }} props
 *   `pendingPoint`/`livePreviewPoint` are the in-progress two-click draw
 *   (see ImageViewport.js) -- rendered as a live dashed preview with
 *   endpoint markers on the Annotation layer while active.
 */
function LayerRenderer({
  layers,
  imageBasename,
  imageType,
  width,
  height,
  hiddenLineIds = new Set(),
  selectedLineId = null,
  onAnnotationClick,
  onAnnotationMouseDown,
  onEndpointMouseDown,
  pendingPoint,
  livePreviewPoint,
}) {
  const stage1 = useStage(1);
  const stage2 = useStage(2);
  const overlayLayers = layers.filter((layer) => layer.type !== "base");

  const isDiffraction = imageType === "Diffraction";

  const allLines = isDiffraction
    ? []
    : (stage1.data.temImages?.find((t) => t.image === imageBasename)?.lines ?? []).filter(isActiveLine);
  const detectedLines = allLines.filter((l) => l.source !== "manual");
  const manualLines = allLines.filter((l) => l.source === "manual");

  const millerByGId = stage2.data.millerIndexByGvector?.[imageBasename] ?? {};
  const allGVectors = isDiffraction
    ? (stage1.data.diffImages?.find((d) => d.image === imageBasename)?.gvecs ?? []).filter(isActiveGVector)
    : [];
  const detectedGVectors = allGVectors.filter((g) => g.source !== "manual");
  const manualGVectors = allGVectors.filter((g) => g.source === "manual");

  return (
    <>
      {overlayLayers.map((layer) => {
        let content;
        if (layer.type === "detection") {
          content = isDiffraction ? (
            <GVectorsSvg
              gvecs={detectedGVectors}
              millerByGId={millerByGId}
              width={width}
              height={height}
              color={DETECTED_GVECTOR_COLOR}
              hiddenLineIds={hiddenLineIds}
              selectedLineId={selectedLineId}
              onAnnotationClick={onAnnotationClick}
              onAnnotationMouseDown={onAnnotationMouseDown}
              onEndpointMouseDown={onEndpointMouseDown}
            />
          ) : (
            <LinesSvg
              lines={detectedLines}
              width={width}
              height={height}
              fallbackColor={DETECTED_FALLBACK_COLOR}
              hiddenLineIds={hiddenLineIds}
              selectedLineId={selectedLineId}
              onAnnotationClick={onAnnotationClick}
              onAnnotationMouseDown={onAnnotationMouseDown}
              onEndpointMouseDown={onEndpointMouseDown}
            />
          );
        } else if (layer.type === "annotation") {
          content = isDiffraction ? (
            <GVectorsSvg
              gvecs={manualGVectors}
              millerByGId={millerByGId}
              width={width}
              height={height}
              color={MANUAL_GVECTOR_COLOR}
              dashArray={MANUAL_DASH}
              hiddenLineIds={hiddenLineIds}
              selectedLineId={selectedLineId}
              onAnnotationClick={onAnnotationClick}
              onAnnotationMouseDown={onAnnotationMouseDown}
              onEndpointMouseDown={onEndpointMouseDown}
              pendingPoint={pendingPoint}
              livePreviewPoint={livePreviewPoint}
            />
          ) : (
            <LinesSvg
              lines={manualLines}
              width={width}
              height={height}
              fallbackColor={MANUAL_LINE_COLOR}
              dashArray={MANUAL_DASH}
              hiddenLineIds={hiddenLineIds}
              selectedLineId={selectedLineId}
              onAnnotationClick={onAnnotationClick}
              onAnnotationMouseDown={onAnnotationMouseDown}
              onEndpointMouseDown={onEndpointMouseDown}
              pendingPoint={pendingPoint}
              livePreviewPoint={livePreviewPoint}
            />
          );
        } else {
          content = (
            <div className="flex items-start justify-end p-1.5">
              <span className="rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90">
                {layer.name}
              </span>
            </div>
          );
        }

        return (
          <div
            key={layer.id}
            className="absolute inset-0"
            style={{ opacity: layer.visible ? layer.opacity : 0, mixBlendMode: layer.blendMode }}
          >
            {layer.visible && content}
          </div>
        );
      })}
    </>
  );
}

function pendingPreview(unit, pendingPoint, livePreviewPoint, strokeW) {
  if (!pendingPoint) return null;
  return (
    <>
      {livePreviewPoint && (
        <line
          x1={pendingPoint.x}
          y1={pendingPoint.y}
          x2={livePreviewPoint.x}
          y2={livePreviewPoint.y}
          stroke={PENDING_COLOR}
          strokeWidth={strokeW}
          strokeDasharray="6 5"
          strokeLinecap="round"
        />
      )}
      <circle cx={pendingPoint.x} cy={pendingPoint.y} r={unit * 0.012} fill={PENDING_COLOR} />
      {livePreviewPoint && (
        <circle cx={livePreviewPoint.x} cy={livePreviewPoint.y} r={unit * 0.012} fill="none" stroke={PENDING_COLOR} strokeWidth={strokeW} />
      )}
    </>
  );
}

function LinesSvg({
  lines,
  width,
  height,
  fallbackColor,
  dashArray,
  hiddenLineIds,
  selectedLineId,
  onAnnotationClick,
  onAnnotationMouseDown,
  onEndpointMouseDown,
  pendingPoint,
  livePreviewPoint,
}) {
  const viewW = width || 800;
  const viewH = height || 600;
  const unit = Math.max(viewW, viewH);
  const strokeW = unit * 0.0035;
  const handleR = unit * 0.014;
  const handleStrokeW = unit * 0.003;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className={`absolute inset-0 h-full w-full ${onAnnotationClick || onAnnotationMouseDown ? "" : "pointer-events-none"}`}
    >
      {lines.map((line) => {
        if (hiddenLineIds.has(line.id)) return null;
        const isSelected = line.id === selectedLineId;
        const strokeColor = isSelected ? SELECTED_COLOR : line.color || fallbackColor;
        const midX = (line.x1 + line.x2) / 2;
        const midY = (line.y1 + line.y2) / 2;

        return (
          <g
            key={line.id}
            onMouseDown={onAnnotationMouseDown ? (e) => { e.stopPropagation(); onAnnotationMouseDown(e, line.id); } : undefined}
            onClick={onAnnotationClick ? (e) => { e.stopPropagation(); onAnnotationClick(line.id); } : undefined}
            style={{ cursor: onAnnotationMouseDown ? "move" : onAnnotationClick ? "pointer" : "default" }}
          >
            {(onAnnotationClick || onAnnotationMouseDown) && (
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={unit * 0.02} />
            )}
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={strokeColor}
              strokeWidth={isSelected ? strokeW * 1.6 : strokeW}
              strokeDasharray={dashArray}
              strokeLinecap="round"
            />
            <circle cx={midX} cy={midY} r={unit * 0.01} fill={strokeColor} />
            <text
              x={midX}
              y={midY - unit * 0.016}
              textAnchor="middle"
              fontSize={unit * 0.024}
              fontWeight="600"
              fill={strokeColor}
              stroke="#0B1220"
              strokeWidth={unit * 0.003}
              paintOrder="stroke"
              style={{ fontFamily: "ui-monospace, monospace" }}
            >
              {line.label}
            </text>

            {isSelected && (
              <>
                <circle
                  cx={line.x1}
                  cy={line.y1}
                  r={handleR}
                  fill="#F97316"
                  stroke="#FFFFFF"
                  strokeWidth={handleStrokeW}
                  className="cursor-move pointer-events-auto"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onEndpointMouseDown?.(e, line.id, 1);
                  }}
                />
                <circle
                  cx={line.x2}
                  cy={line.y2}
                  r={handleR}
                  fill="#F97316"
                  stroke="#FFFFFF"
                  strokeWidth={handleStrokeW}
                  className="cursor-move pointer-events-auto"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onEndpointMouseDown?.(e, line.id, 2);
                  }}
                />
              </>
            )}
          </g>
        );
      })}
      {pendingPreview(unit, pendingPoint, livePreviewPoint, strokeW)}
    </svg>
  );
}

function GVectorsSvg({
  gvecs,
  millerByGId,
  width,
  height,
  color,
  dashArray,
  hiddenLineIds,
  selectedLineId,
  onAnnotationClick,
  onAnnotationMouseDown,
  onEndpointMouseDown,
  pendingPoint,
  livePreviewPoint,
}) {
  const viewW = width || 800;
  const viewH = height || 600;
  const unit = Math.max(viewW, viewH);
  const strokeW = unit * 0.0035;
  const handleR = unit * 0.014;
  const handleStrokeW = unit * 0.003;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className={`absolute inset-0 h-full w-full ${onAnnotationClick || onAnnotationMouseDown ? "" : "pointer-events-none"}`}
    >
      {gvecs.map((g) => {
        if (hiddenLineIds.has(g.id)) return null;
        const isSelected = g.id === selectedLineId;
        const strokeColor = isSelected ? SELECTED_COLOR : color;
        const hkl = millerByGId[g.g_id];
        const label = hkl ? `${g.g_id} [${hkl.join(" ")}]` : g.g_id;

        return (
          <g
            key={g.id}
            onMouseDown={onAnnotationMouseDown ? (e) => { e.stopPropagation(); onAnnotationMouseDown(e, g.id); } : undefined}
            onClick={onAnnotationClick ? (e) => { e.stopPropagation(); onAnnotationClick(g.id); } : undefined}
            style={{ cursor: onAnnotationMouseDown ? "move" : onAnnotationClick ? "pointer" : "default" }}
          >
            {(onAnnotationClick || onAnnotationMouseDown) && (
              <line x1={g.ox} y1={g.oy} x2={g.tx} y2={g.ty} stroke="transparent" strokeWidth={unit * 0.02} />
            )}
            <line
              x1={g.ox}
              y1={g.oy}
              x2={g.tx}
              y2={g.ty}
              stroke={strokeColor}
              strokeWidth={isSelected ? strokeW * 1.6 : strokeW}
              strokeDasharray={dashArray}
              strokeLinecap="round"
              markerEnd={`url(#gvec-arrowhead-${isSelected ? "selected" : "normal"})`}
            />
            <circle cx={g.ox} cy={g.oy} r={unit * 0.008} fill={strokeColor} />
            <text
              x={g.tx}
              y={g.ty - unit * 0.016}
              textAnchor="middle"
              fontSize={unit * 0.022}
              fontWeight="600"
              fill={strokeColor}
              stroke="#0B1220"
              strokeWidth={unit * 0.003}
              paintOrder="stroke"
              style={{ fontFamily: "ui-monospace, monospace" }}
            >
              {label}
            </text>

            {isSelected && (
              <>
                <circle
                  cx={g.ox}
                  cy={g.oy}
                  r={handleR}
                  fill="#F97316"
                  stroke="#FFFFFF"
                  strokeWidth={handleStrokeW}
                  className="cursor-move pointer-events-auto"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onEndpointMouseDown?.(e, g.id, 1);
                  }}
                />
                <circle
                  cx={g.tx}
                  cy={g.ty}
                  r={handleR}
                  fill="#F97316"
                  stroke="#FFFFFF"
                  strokeWidth={handleStrokeW}
                  className="cursor-move pointer-events-auto"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onEndpointMouseDown?.(e, g.id, 2);
                  }}
                />
              </>
            )}
          </g>
        );
      })}
      {pendingPreview(unit, pendingPoint, livePreviewPoint, strokeW)}
      <defs>
        <marker id="gvec-arrowhead-normal" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={color} />
        </marker>
        <marker id="gvec-arrowhead-selected" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={SELECTED_COLOR} />
        </marker>
      </defs>
    </svg>
  );
}

export default memo(LayerRenderer);
