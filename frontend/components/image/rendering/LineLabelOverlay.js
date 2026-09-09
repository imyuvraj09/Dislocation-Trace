import { memo } from "react";
import useProjectStore from "@/store/projectStore";

const DETECTED_COLOR = "#22C55E"; // solid green
const MANUAL_COLOR = "#3B82F6"; // dashed blue
const MANUAL_DASH = "10 6";

function LineLabelOverlay({ src, filename, width, height, lines, highlightedLabels = {}, onLineClick, rotation: propRotation }) {
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
  const circleR = unit * 0.012;
  const fontSz = unit * 0.028;
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
          <img src={src} alt={filename} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} loading="eager" decoding="async" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
            Preview unavailable for {filename}
          </div>
        )}

        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full pointer-events-auto"
        >
          {lines.map((line) => {
            const isManual = line.source === "manual";
            const baseColor = isManual ? MANUAL_COLOR : DETECTED_COLOR;
            const color = highlightedLabels[line.label] ?? baseColor;
            const midX = (line.x1 + line.x2) / 2;
            const midY = (line.y1 + line.y2) / 2;
            const clickable = Boolean(onLineClick);
            return (
              <g
                key={line.label}
                onClick={clickable ? () => onLineClick(line.label) : undefined}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {/* Wider, invisible hit-area so a thin trace is still easy to click. */}
                <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={hitWidth} />
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={color}
                  strokeWidth={strokeW}
                  strokeDasharray={isManual ? MANUAL_DASH : undefined}
                  strokeLinecap="round"
                />
                <circle cx={midX} cy={midY} r={circleR} fill={color} />
                <text
                  x={midX}
                  y={midY - textOffsetY}
                  textAnchor="middle"
                  fontSize={fontSz}
                  fontWeight="600"
                  fill={color}
                  stroke="#0B1220"
                  strokeWidth={strokeOutlineW}
                  paintOrder="stroke"
                  style={{ fontFamily: "ui-monospace, monospace" }}
                >
                  {line.label}
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

export default memo(LineLabelOverlay);
