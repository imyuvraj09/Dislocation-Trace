import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import useProjectStore from "@/store/projectStore";
import { processImageFile } from "@/lib/tiffUtils";
import PipelineTimeline from "@/components/pipeline/PipelineTimeline";

/**
 * Accepted file extensions for both TEM and diffraction image uploads.
 * Matches the requirement: .tif, .tiff, .png, .jpg, .jpeg.
 */
const ACCEPT_FORMATS = ".tif,.tiff,.png,.jpg,.jpeg,.bmp";

/**
 * Step indicator — shows which step is active / completed.
 */
function StepIndicator({ number, title, status }) {
  const isActive = status === "active";
  const isDone = status === "done";

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
          isDone
            ? "bg-beam-500 text-white"
            : isActive
            ? "bg-beam-gradient text-white shadow-node"
            : "border border-line bg-surfaceAlt text-subtle"
        }`}
      >
        {isDone ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          number
        )}
      </span>
      <span className={`text-sm font-medium ${isActive || isDone ? "text-ink" : "text-subtle"}`}>
        {title}
      </span>
    </div>
  );
}

/**
 * Thumbnail card for a single uploaded image with a remove button.
 */
function ImageThumbnail({ file, onRemove }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    let active = true;
    processImageFile(file, "TEM").then((res) => {
      if (active) setThumbUrl(res.thumbnail);
    });
    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div className="group relative rounded-lg border border-line bg-surface p-2 transition-colors hover:border-lineStrong">
      <div className="relative aspect-square overflow-hidden rounded-md bg-surfaceAlt flex items-center justify-center">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-subtle">Loading...</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove image"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/60 text-white opacity-0 transition-opacity hover:bg-err group-hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mt-1.5 truncate text-xs text-muted" title={file.name}>
        {file.name}
      </p>
    </div>
  );
}

/**
 * Dropzone for one image category (TEM or Diffraction).
 * Supports drag-and-drop, browse, single/multi upload, add-more, and remove.
 */
function ImageDropzone({ label, files, onAddFiles, onRemoveFile }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) onAddFiles(Array.from(e.dataTransfer.files));
    },
    [onAddFiles]
  );

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? "border-beam-500 bg-beam-50"
            : "border-line bg-surfaceAlt hover:border-lineStrong"
        }`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="mx-auto text-subtle">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-2 text-sm text-muted">
          Drag &amp; drop, or{" "}
          <label className="cursor-pointer text-beam-600 underline">
            Browse Files
            <input
              type="file"
              accept={ACCEPT_FORMATS}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onAddFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-subtle">
          Supported: {ACCEPT_FORMATS.split(",").join(", ")}
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {files.map((file, index) => (
            <ImageThumbnail
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              onRemove={() => onRemoveFile(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * NewWorkflow — the 2-step pipeline flow:
 *   1. Input Images
 *   2. Go to Image Workshop (manual indexing)
 */
export default function NewWorkflow() {
  const router = useRouter();

  // Project store actions
  const setImages = useProjectStore((s) => s.setImages);
  const registerImages = useProjectStore((s) => s.registerImages);
  const registeredImageIds = useProjectStore((s) =>
    Object.keys(s.project.images.byId)
  );

  // File state stored in global project store so it survives client-side routing
  const temFiles = useProjectStore((s) => s.project.images.tem);
  const diffFiles = useProjectStore((s) => s.project.images.diffraction);
  const selectedBurgersVector = useProjectStore((s) => s.project.material?.selectedBurgersVector ?? null);
  const hasBurgersVector = selectedBurgersVector !== null;

  // Are there images registered in the workspace (means user went to workshop)?
  const hasRegistered = registeredImageIds.length > 0;

  // Determine active step
  const totalFiles = temFiles.length + diffFiles.length;
  const hasFiles = totalFiles > 0;

  // Step statuses
  const step1Status = hasFiles ? "done" : "active";
  const step2Status = !hasFiles
    ? "pending"
    : hasRegistered
    ? "done"
    : "active";

  // ── Step 1: Add / remove files ──

  function addTemFiles(newFiles) {
    const updated = [...temFiles, ...newFiles];
    setImages("tem", updated);
  }

  function removeTemFile(index) {
    const updated = temFiles.filter((_, i) => i !== index);
    setImages("tem", updated);
  }

  function addDiffFiles(newFiles) {
    const updated = [...diffFiles, ...newFiles];
    setImages("diffraction", updated);
  }

  function removeDiffFile(index) {
    const updated = diffFiles.filter((_, i) => i !== index);
    setImages("diffraction", updated);
  }

  // ── Step 2: Go to Image Workshop ──

  async function handleGoToWorkshop() {
    // Process every uploaded file (decoding TIFF files to PNG Object URLs
    // if needed) and measure its real pixel dimensions.
    const promises = [
      ...temFiles.map((f) => processImageFile(f, "TEM")),
      ...diffFiles.map((f) => processImageFile(f, "Diffraction")),
    ];
    const records = await Promise.all(promises);

    if (records.length > 0) registerImages(records);
    router.push("/workspace");
  }

  return (
    <div className="space-y-10">
      {!hasBurgersVector && (
        <Alert variant="info" className="text-sm">
          Burgers-vector identification is optional at this stage. If the Burgers vector is already known, proceed to the Image Workshop and enter it after the true line direction has been reconstructed.
        </Alert>
      )}

      {/* ── Step indicators ── */}
      <div className="flex items-center gap-6">
        <StepIndicator number={1} title="Upload images" status={step1Status} />
        <div className="h-px flex-1 bg-line" />
        <StepIndicator number={2} title="Image Workshop" status={step2Status} />
      </div>

      {/* ── Step 1: Upload images ── */}
      <section className="rounded-xl border border-line bg-surface px-6 py-6 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Step 1 — Upload images</h2>
        <div className="mt-2 space-y-2 text-sm text-muted">
          <p>
            Upload TEM images of the same dislocation segments at two different specimen orientations, near two zone axes, using diffraction conditions where the segments are clearly visible.
          </p>
          <ul className="space-y-1">
            <li>• First box — TEM images (BF/DF): Upload the micrographs from both orientations.</li>
            <li>• Second box — Diffraction patterns (SAED): Upload each micrograph’s corresponding pattern, acquired from the same crystal region without changing the specimen orientation.</li>
          </ul>
          <p>
            Drag and drop or browse files. Use matching filenames to identify each TEM–SAED pair.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ImageDropzone
            label="TEM images (bright-field / dark-field)"
            files={temFiles}
            onAddFiles={addTemFiles}
            onRemoveFile={removeTemFile}
          />
          <ImageDropzone
            label="Diffraction images (SAED)"
            files={diffFiles}
            onAddFiles={addDiffFiles}
            onRemoveFile={removeDiffFile}
          />
        </div>
      </section>

      {/* ── Step 2: Go to Image Workshop ── */}
      {hasFiles && (
        <section className="rounded-xl border border-line bg-surface px-6 py-6 shadow-panel">
          <h2 className="text-lg font-semibold text-ink">Step 2 — Image Workshop</h2>
          <p className="mt-1 text-sm text-muted">
            Open the Image Workshop to inspect your images and perform manual
            indexing.
          </p>

          <div className="mt-5">
            <Button onClick={handleGoToWorkshop}>
              Go to Image Workshop
            </Button>
          </div>
        </section>
      )}



      {/* ── Remaining stages of the CrystalTrace pipeline (Stages 2–7) ── */}
      <section className="pt-6 border-t border-line">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-beam-600">
            Downstream analysis
          </p>
          <p className="mt-1.5 text-sm text-muted">
            Proceed with Zone Axis &amp; Miller Indexing, Line Pairing, Angle Computation, Up-vector Solving, True Dislocation Line, and Batch Output.
          </p>
        </div>
        <PipelineTimeline excludeStage1 />
      </section>
    </div>
  );
}
