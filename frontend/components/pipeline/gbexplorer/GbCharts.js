/**
 * Minimal inline-SVG chart primitives for the g.b Explorer panel. The
 * standalone app used Plotly; CrystalTrace's frontend has no chart
 * dependency (see package.json), so these are small, self-contained
 * substitutes -- heatmap, bar chart, histogram, stacked bar -- styled
 * with the same design tokens as the rest of the pipeline UI rather than
 * pulling in a new library for five chart calls.
 */

const POS = "#12938A"; // beam-500
const NEG = "#C4432B"; // err
const ZERO = "#1E8E5A"; // ok

function cellColor(v) {
  if (v === 0) return ZERO;
  return v > 0 ? POS : NEG;
}

export function GbHeatmap({ gVectors, bCols, values, maxRows = 60 }) {
  const cell = 34;
  const rowLabelW = 90;
  const colLabelH = 60;
  const step = gVectors.length > maxRows ? Math.ceil(gVectors.length / maxRows) : 1;
  const rows = [];
  for (let i = 0; i < gVectors.length; i += step) rows.push(i);

  const width = rowLabelW + bCols.length * cell;
  const height = colLabelH + rows.length * cell;

  return (
    <div className="overflow-auto rounded-md border border-line bg-surface">
      <svg width={width} height={height} className="block">
        {bCols.map((b, j) => (
          <text
            key={b}
            x={rowLabelW + j * cell + cell / 2}
            y={colLabelH - 8}
            transform={`rotate(-45 ${rowLabelW + j * cell + cell / 2} ${colLabelH - 8})`}
            textAnchor="start"
            className="fill-muted font-mono"
            fontSize="10"
          >
            {b}
          </text>
        ))}
        {rows.map((gi, r) => (
          <text key={gi} x={rowLabelW - 8} y={colLabelH + r * cell + cell / 2 + 4} textAnchor="end" className="fill-muted font-mono" fontSize="10">
            {gVectors[gi]}
          </text>
        ))}
        {rows.map((gi, r) =>
          bCols.map((_, j) => {
            const v = values[gi][j];
            return (
              <g key={`${gi}-${j}`}>
                <rect
                  x={rowLabelW + j * cell}
                  y={colLabelH + r * cell}
                  width={cell - 2}
                  height={cell - 2}
                  fill={cellColor(v)}
                  opacity={v === 0 ? 0.85 : 0.35}
                  rx={3}
                />
                <text
                  x={rowLabelW + j * cell + cell / 2}
                  y={colLabelH + r * cell + cell / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-ink font-mono"
                >
                  {v}
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

export function GbBarChart({ labels, values, title }) {
  const width = Math.max(360, labels.length * 56);
  const height = 220;
  const padB = 46;
  const padT = 16;
  const plotH = height - padB - padT;
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const zeroY = padT + plotH / 2;
  const barW = Math.min(40, (width / labels.length) * 0.6);

  return (
    <div className="overflow-auto rounded-md border border-line bg-surface p-2">
      {title && <p className="mb-1 px-1 text-xs font-medium text-muted">{title}</p>}
      <svg width={width} height={height}>
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#C7CDD5" strokeDasharray="4 3" />
        {values.map((v, i) => {
          const x = i * (width / labels.length) + (width / labels.length - barW) / 2;
          const h = (Math.abs(v) / maxAbs) * (plotH / 2);
          const y = v >= 0 ? zeroY - h : zeroY;
          return (
            <g key={labels[i]}>
              <rect x={x} y={y} width={barW} height={Math.max(h, 1)} fill={cellColor(v)} rx={3} />
              <text x={x + barW / 2} y={v >= 0 ? y - 4 : y + h + 12} textAnchor="middle" fontSize="10" className="fill-ink font-mono">
                {v}
              </text>
              <text
                x={x + barW / 2}
                y={height - padB + 14}
                textAnchor="end"
                fontSize="10"
                className="fill-muted font-mono"
                transform={`rotate(-40 ${x + barW / 2} ${height - padB + 14})`}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GbHistogram({ values, bins = 20 }) {
  const width = 480;
  const height = 220;
  const padB = 30;
  const padT = 16;
  const plotH = height - padB - padT;
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binW = range / bins;
  const counts = Array(bins).fill(0);
  values.forEach((v) => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / binW)));
    counts[idx]++;
  });
  const maxCount = Math.max(1, ...counts);
  const barW = width / bins;
  const zeroBin = Math.min(bins - 1, Math.max(0, Math.floor((0 - min) / binW)));

  return (
    <div className="overflow-auto rounded-md border border-line bg-surface p-2">
      <svg width={width} height={height}>
        {counts.map((c, i) => {
          const h = (c / maxCount) * plotH;
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={padT + plotH - h}
              width={Math.max(barW - 2, 1)}
              height={h}
              fill={i === zeroBin ? ZERO : "#3768D6"}
              opacity={0.85}
            />
          );
        })}
        <text x={4} y={height - padB + 16} fontSize="10" className="fill-muted">
          {min.toFixed(0)}
        </text>
        <text x={width - 20} y={height - padB + 16} fontSize="10" className="fill-muted">
          {max.toFixed(0)}
        </text>
      </svg>
    </div>
  );
}

export function GbStackedBar({ labels, invCounts, visCounts }) {
  const width = Math.max(360, labels.length * 56);
  const height = 220;
  const padB = 46;
  const padT = 16;
  const plotH = height - padB - padT;
  const maxTotal = Math.max(1, ...labels.map((_, i) => invCounts[i] + visCounts[i]));
  const barW = Math.min(40, (width / labels.length) * 0.6);

  return (
    <div className="overflow-auto rounded-md border border-line bg-surface p-2">
      <div className="mb-1 flex items-center gap-4 px-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZERO }} /> {"Invisible (g\u00b7b=0)"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEG }} /> {"Visible (g\u00b7b\u22600)"}
        </span>
      </div>
      <svg width={width} height={height}>
        {labels.map((label, i) => {
          const x = i * (width / labels.length) + (width / labels.length - barW) / 2;
          const invH = (invCounts[i] / maxTotal) * plotH;
          const visH = (visCounts[i] / maxTotal) * plotH;
          const yBase = padT + plotH;
          return (
            <g key={label}>
              <rect x={x} y={yBase - invH} width={barW} height={invH} fill={ZERO} />
              <rect x={x} y={yBase - invH - visH} width={barW} height={visH} fill={NEG} />
              <text
                x={x + barW / 2}
                y={height - padB + 14}
                textAnchor="end"
                fontSize="10"
                className="fill-muted font-mono"
                transform={`rotate(-40 ${x + barW / 2} ${height - padB + 14})`}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
