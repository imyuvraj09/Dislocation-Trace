import useProjectStore from "@/store/projectStore";

/**
 * A thin strip of at-a-glance viewport facts -- zoom %, rotation, image
 * dimensions, active filename. Purely a readout; no interaction.
 *
 * @param {{imageId: string|null}} props
 */
export default function StatusBar({ imageId }) {
  const image = useProjectStore((state) =>
    imageId ? state.project.images.byId[imageId] ?? null : null
  );

  if (!image) {
    return (
      <div className="flex items-center justify-between border-t border-line bg-surfaceAlt px-4 py-1.5 text-[11px] text-subtle">
        No image selected
      </div>
    );
  }

  const { viewport } = image;

  return (
    <div className="flex items-center justify-between border-t border-line bg-surfaceAlt px-4 py-1.5 text-[11px] text-muted">
      <span className="truncate font-mono">{image.filename}</span>
      <div className="flex items-center gap-4 font-mono">
        <span>
          {image.width || "?"} × {image.height || "?"} px
        </span>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <span>{viewport.rotation}°</span>
        {viewport.brightness !== 0 && <span>B {viewport.brightness > 0 ? "+" : ""}{viewport.brightness}</span>}
        {viewport.contrast !== 0 && <span>C {viewport.contrast > 0 ? "+" : ""}{viewport.contrast}</span>}
      </div>
    </div>
  );
}
