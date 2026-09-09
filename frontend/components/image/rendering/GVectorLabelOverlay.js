import { memo } from "react";
import useProjectStore from "@/store/projectStore";

const DETECTED_COLOR = "#A78BFA"; // violet, matches the Workspace's GVectorsSvg
const MANUAL_COLOR = "#3B82F6"; // dashed blue, same convention as manual lines
const MANUAL_DASH = "10 6";

function GVectorLabelOverlay({
  src,
  filename,
  width,
  height,
  gvecs,
  highlightedIds = {},
  onGVectorClick,
  rotation: propRotation,
}) {
  const storeRotation = useProjectStore((s) => {
    if (!filename) return 0;
    const img = Object.values(s.project.images.byId ?? {}).find((i) => i.filename === filename || i.id === filename);
    return img?.viewport?.rotation ?? 0;
  });
  const rotation = propRotation ?? storeRotation ?? 0;

  const viewW = width || 800;
  const viewH = height || 600;
  const unit = Math.max(viewW, viewH);
  const hitWidth = unit * 0.02;
  const strokeW = unit * 0.0035;
  const arrowSize = unit * 0.014;
  const circleR = unit * 0.008;
  const fontSz = unit * 0.026;
  const textOffsetY = unit * 0.018;
  const strokeOutlineW = unit * 0.004;

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-[#0B1220]">
      <div
        className="relative w-full transition-transform duration-150"
        style={{
          aspectRatio: `${viewW} / ${viewH}`,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={filename}
            className="absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
            Preview unavailable for {filename}
          </div>
        )}

        <svg viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full pointer-events-auto">
          {gvecs.map((g) => {
            const isManual = g.source === "manual";
            const baseColor = isManual ? MANUAL_COLOR : DETECTED_COLOR;
            const color = highlightedIds[g.g_id] ?? baseColor;
            const clickable = Boolean(onGVectorClick);
            const label = g.label ?? g.g_id;
            const angleDeg = (Math.atan2(g.ty - g.oy, g.tx - g.ox) * 180) / Math.PI;

            return (
              <g
                key={g.g_id}
                onClick={clickable ? () => onGVectorClick(g.g_id) : undefined}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {/* Wider, invisible hit-area so a thin vector is still easy to click. */}
                <line x1={g.ox} y1={g.oy} x2={g.tx} y2={g.ty} stroke="transparent" strokeWidth={hitWidth} />
                <line
                  x1={g.ox}
                  y1={g.oy}
                  x2={g.tx}
                  y2={g.ty}
                  stroke={color}
                  strokeWidth={strokeW}
                  strokeDasharray={isManual ? MANUAL_DASH : undefined}
                  strokeLinecap="round"
                />
                <path
                  d={`M${-arrowSize},${-arrowSize * 0.6} L0,0 L${-arrowSize},${arrowSize * 0.6} Z`}
                  fill={color}
                  transform={`translate(${g.tx}, ${g.ty}) rotate(${angleDeg})`}
                />
                <circle cx={g.ox} cy={g.oy} r={circleR} fill={color} />
                <text
                  x={g.tx}
                  y={g.ty - textOffsetY}
                  textAnchor="middle"
                  fontSize={fontSz}
                  fontWeight="600"
                  fill={color}
                  stroke="#0B1220"
                  strokeWidth={strokeOutlineW}
                  paintOrder="stroke"
                  style={{ fontFamily: "ui-monospace, monospace" }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="border-t border-white/10 px-2 py-1 font-mono text-[11px] text-white/60">{filename}</p>
    </div>
  );
}

export default memo(GVectorLabelOverlay);
