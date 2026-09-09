import Head from "next/head";
import Link from "next/link";
import { ImageViewer } from "@/components/image";
import Button from "@/components/ui/Button";

export default function WorkspacePage() {
  return (
    <>
      <Head>
        <title>Image Workspace — Dislocation Trace</title>
      </Head>

      <div className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-beam-600">
              Reusable image infrastructure
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Image Workspace</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              Browse, pan, zoom, adjust brightness/contrast, and inspect any
              image registered by the pipeline. On a TEM image, use Draw Line
              to add or correct a dislocation line by hand; on a diffraction
              image, use Mark G-vector the same way for a spot. Either becomes
              a first-class annotation with its own label, available in Stage
              3 (line pairing) or Stage 2 (Miller indexing) alongside the
              automatically detected ones. Select any line or g-vector
              (Pointer tool) to hide or delete it -- deletion is non-
              destructive and can be undone from the &quot;Deleted&quot; list
              in the Inspector Panel.
            </p>
          </div>
          <div className="shrink-0 pt-2">
            <Link href="/pipeline">
              <Button variant="primary" className="shadow-sm">
                Continue to Pipeline &rarr;
              </Button>
            </Link>
          </div>
        </header>

        <ImageViewer />
      </div>
    </>
  );
}
