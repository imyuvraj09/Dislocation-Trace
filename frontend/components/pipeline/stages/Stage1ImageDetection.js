import { useRouter } from "next/router";
import Link from "next/link";
import FileDropzone from "@/components/ui/FileDropzone";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { uploadImages } from "@/lib/api";
import { normalizeDetectedLine, normalizeDetectedGVector } from "@/lib/annotations";
import { processImageFile } from "@/lib/tiffUtils";
import useProjectStore from "@/store/projectStore";
import useStage from "@/hooks/useStage";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export default function Stage1ImageDetection({ onComplete }) {
  const router = useRouter();

  // Uploaded/detected images are shared, cross-stage resources, so they
  // live in the store's top-level `images` bucket rather than in this
  // stage's own data (see models/project.js).
  const images = useProjectStore((state) => state.project.images);
  const setImages = useProjectStore((state) => state.setImages);
  const registerImages = useProjectStore((state) => state.registerImages);

  // This stage's own output: how many lines were detected, across how
  // many images. Persists across remounts/project reloads via the store.
  const { data, update } = useStage(1);

  const { loading, error, run } = useAsyncAction();

  const canRun = images.tem.length > 0 && images.diffraction.length > 0;

  async function handleRun() {
    const res = await run(() =>
      uploadImages({ tem: images.tem, diffraction: images.diffraction })
    );
    if (res === undefined) return; // failed; error banner already shown

    const allFiles = [...images.tem, ...images.diffraction];
    const promises = res.images.map(async (record) => {
      const file = allFiles.find((f) => f.name === record.filename);
      if (file) {
        const processed = await processImageFile(file, record.type);
        return { ...record, ...processed, thumbnail: processed.thumbnail };
      }
      return record;
    });
    const withThumbnails = await Promise.all(promises);

    // Register detection results as full Image Workspace entities
    registerImages(withThumbnails);

    const normalizedTemImages = res.temImages.map((t) => ({
      ...t,
      lines: t.lines.map((line) => normalizeDetectedLine(t.image, line)),
    }));
    const normalizedDiffImages = res.diffImages.map((d) => ({
      ...d,
      gvecs: d.gvecs.map((g) => normalizeDetectedGVector(d.image, g)),
    }));

    update({
      detectedLines: res.detectedLines,
      imageCount: res.images.length,
      temImages: normalizedTemImages,
      diffImages: normalizedDiffImages,
    });
    onComplete?.(res);

    // Immediately navigate to Image Workshop after successful detection
    router.push("/workspace");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <FileDropzone
          label="TEM images (bright-field / dark-field)"
          accept=".tif,.tiff,.dm3,.png"
          files={images.tem}
          onFiles={(files) => setImages("tem", files)}
        />
        <FileDropzone
          label="Diffraction images (SAED)"
          accept=".tif,.tiff,.dm3,.png"
          files={images.diffraction}
          onFiles={(files) => setImages("diffraction", files)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleRun} disabled={!canRun} loading={loading}>
          Run image detection
        </Button>
        {!canRun && (
          <p className="text-xs text-subtle">
            Upload at least one TEM image and one diffraction image to continue.
          </p>
        )}
      </div>

      <Alert variant="error" message={error} onRetry={canRun ? handleRun : undefined} />

      {data.detectedLines != null && (
        <Alert variant="success">
          Detected <span className="font-semibold">{data.detectedLines}</span>{" "}
          candidate dislocation line segments across {data.imageCount} images.
          Continue to Miller Index Input, or{" "}
          <Link href="/workspace" className="font-medium underline underline-offset-2">
            open the Image Workspace
          </Link>{" "}
          to inspect them.
        </Alert>
      )}
    </div>
  );
}
