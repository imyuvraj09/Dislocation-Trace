import { memo, useState, useEffect } from "react";

/**
 * Renders the base image's pixels -- or, absent real image bytes (no
 * decoding/image processing happens here), a labeled placeholder tile.
 * This is the bottom of the layer stack; `LayerRenderer` paints everything
 * above it in the same transformed space (see `ImageViewport`, which owns
 * the zoom/pan/rotate transform both renderers sit inside).
 *
 * Takes only the primitive fields it actually renders (not the whole
 * `image` entity) so `React.memo` can skip re-rendering while the user
 * pans/zooms/rotates/adjusts brightness -- none of which change a
 * filename, thumbnail, or dimensions. This is deliberate: the `image`
 * entity's object reference changes on every viewport tick (the store
 * replaces it to update `viewport`), but these specific fields don't, so
 * comparing them directly (memo's default shallow prop comparison) is
 * what actually prevents wasted re-renders on large images.
 *
 * If the browser can't decode the image format (e.g. raw TIFF without
 * codec support), the `<img>` tag would show a broken-image icon. An
 * `onError` handler catches this and falls back to the labeled placeholder
 * tile so the canvas never shows a broken icon.
 */
function CanvasRenderer({ filename, thumbnail, src, width, height }) {
  if (!filename) return null;

  const resolvedSrc = thumbnail ?? src ?? null;
  const [loadFailed, setLoadFailed] = useState(false);

  // Reset the failure flag whenever the source changes (e.g. user switches
  // to a different image that might be a decodable format).
  useEffect(() => {
    setLoadFailed(false);
  }, [resolvedSrc]);

  const showImage = resolvedSrc && !loadFailed;

  return showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={filename}
      className="h-full w-full select-none object-contain"
      draggable={false}
      onError={() => setLoadFailed(true)}
    />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-white/20 bg-gradient-to-br from-zone-600/40 via-ink to-beam-600/30 text-center">
      <p className="max-w-[80%] truncate font-mono text-xs text-white/80">{filename}</p>
      <p className="text-[11px] text-white/50">
        {width || "?"} × {height || "?"} px
      </p>
      <p className="text-[10px] uppercase tracking-wide text-white/30">preview unavailable</p>
    </div>
  );
}

export default memo(CanvasRenderer);

