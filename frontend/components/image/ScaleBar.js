import useProjectStore from "@/store/projectStore";

const FALLBACK_NM_PER_PIXEL = 0.5;
const BAR_TARGET_PX = 80;

/**
 * A calibrated scale bar overlay.
 *
 * Prefers the image's own `calibration.nmPerPixel` (see models/image.js)
 * when it's been set -- which nothing in this codebase does yet, since
 * real calibration comes from microscope metadata or a future calibration
 * step, both out of scope here. Until then this falls back to a clearly-
 * placeholder constant, so the component, its sizing math, and its zoom-
 * awareness are all real and reusable; only the calibration source is a
 * stand-in, ready to be replaced by real per-image data with no code
 * change here once something sets `calibration.nmPerPixel`.
 *
 * @param {{imageId: string|null}} props
 */
export default function ScaleBar({ imageId }) {
  const image = useProjectStore((state) =>
    imageId ? state.project.images.byId[imageId] ?? null : null
  );

  if (!image) return null;

  const zoom = image.viewport.zoom;
  const nmPerPixel = image.calibration?.nmPerPixel ?? FALLBACK_NM_PER_PIXEL;
  // Pick a "nice" round nm length that renders close to BAR_TARGET_PX at
  // the current zoom, then derive the actual bar width from it.
  const nmPerScreenPixel = nmPerPixel / zoom;
  const targetNm = BAR_TARGET_PX * nmPerScreenPixel;
  const niceNm = roundToNiceNumber(targetNm);
  const barWidth = niceNm / nmPerScreenPixel;

  return (
    <div className="inline-flex flex-col items-center gap-1 rounded bg-ink/70 px-3 py-1.5">
      <div className="h-[2px] bg-white/90" style={{ width: `${barWidth}px` }} />
      <span className="text-[10px] font-medium text-white/90">{niceNm} nm</span>
    </div>
  );
}

/** Snaps to a 1/2/5 x 10^n sequence, the standard convention for scale bars. */
function roundToNiceNumber(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
  return nice * 10 ** exponent;
}
