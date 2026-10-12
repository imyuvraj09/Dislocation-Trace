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
            <ol className="mt-3 max-w-2xl space-y-2 text-[15px] leading-relaxed text-muted">
              <li>
                1. Select the first TEM image and use Draw Line to precisely mark the projected traces of the dislocation segments you wish to analyse.
              </li>
              <li>
                2. Select the second TEM image and mark the same physical segments using Draw Line.
              </li>
              <li>
                3. Open each corresponding diffraction image and use Mark G-vector to mark at least three independently indexed diffraction vectors. Draw each vector from the central transmitted spot to its indexed diffraction spot.
              </li>
              <li>
                4. To hide or delete an unwanted annotation, select the line or g-vector using Pointer, then choose Hide or Delete in the Inspect Panel.
              </li>
              <li>
                5. After annotating both TEM images and both diffraction patterns, click Continue to Pipeline.
              </li>
            </ol>
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
