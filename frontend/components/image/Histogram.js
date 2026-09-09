import useProjectStore from "@/store/projectStore";

const BAR_COUNT = 24;

/**
 * An intensity histogram.
 *
 * Prefers the image's own `statistics.histogram` (see models/image.js)
 * when a backend has computed one -- nothing does yet, so this normally
 * falls back to a deterministic (seeded by image id, so it's stable
 * across re-renders rather than random noise) placeholder distribution,
 * clearly labeled as such. The bars/layout are real and reusable either
 * way; only the placeholder generator is a stand-in for real per-pixel
 * analysis a Python backend would eventually compute.
 *
 * @param {{imageId: string|null}} props
 */
export default function Histogram({ imageId }) {
  const image = useProjectStore((state) =>
    imageId ? state.project.images.byId[imageId] ?? null : null
  );

  if (!image) {
    return <p className="px-3 py-4 text-xs text-subtle">No image selected.</p>;
  }

  const realHistogram = image.statistics?.histogram;
  const bars = realHistogram ?? placeholderDistribution(image.id);

  return (
    <div className="px-3 py-3">
      <div className="flex h-16 items-end gap-[2px]">
        {bars.map((height, i) => (
          <div key={i} className="flex-1 rounded-t-sm bg-beam-300" style={{ height: `${height * 100}%` }} />
        ))}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-subtle">
        {realHistogram
          ? "Computed intensity distribution"
          : "Placeholder -- real intensity analysis lands with the Python backend"}
      </p>
    </div>
  );
}

/** A stable, seeded pseudo-distribution -- not a real histogram, just a representative shape. */
function placeholderDistribution(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / (BAR_COUNT - 1);
    // A gentle bell-ish curve, perturbed a little by the seed so different
    // images don't all look identical.
    const bell = Math.exp(-Math.pow((t - 0.5) * 2.4, 2));
    const wobble = ((hash + i * 17) % 13) / 13 - 0.5;
    return Math.max(0.04, Math.min(1, bell + wobble * 0.15));
  });
}
