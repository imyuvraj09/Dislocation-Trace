import Head from "next/head";
import GbExplorerPanel from "@/components/pipeline/gbexplorer/GbExplorerPanel";
import useProjectStore from "@/store/projectStore";
import NewWorkflow from "@/components/pipeline/NewWorkflow";

export default function PipelinePage() {
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);

  return (
    <>
      <Head>
        <title>Pipeline — DislocationTrace</title>
      </Head>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs font-medium uppercase tracking-wide text-beam-600">
            Image analysis workflow
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-ink">
            Dislocation trace analysis
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Upload TEM micrographs and corresponding diffraction pattern images,
            then perform manual indexing in the Image Workshop to identify
            dislocation lines and assign diffraction g-vectors. Supported image
            formats include TIFF (.tif, .tiff), JPEG (.jpg, .jpeg), PNG (.png),
            BMP (.bmp), and other common image formats.
          </p>
        </header>

        {/* ── g·b Explorer — Optional Burgers-vector identification ── */}
        <section
          id="gb-explorer-section"
          className="mb-8 sm:mb-10 scroll-mt-6 rounded-xl border border-beam-200 bg-surface px-4 sm:px-5 py-4 sm:py-5 shadow-panel"
        >
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-beam-600">
                Optional — Burgers-vector identification
              </p>
              <span className="rounded-full bg-beam-50 px-2.5 py-0.5 text-xs font-medium text-beam-700 border border-beam-200">
                g·b Explorer
              </span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              g·b Explorer — Select Common Invisible Burgers vector
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
              If the Burgers vector is unknown, select the crystal structure and use diffraction conditions for which the dislocation is invisible to identify the common Burgers vector. If the Burgers vector is already known, this identification step may be skipped. The known Burgers vector can be entered after reconstruction of the true dislocation-line direction.
            </p>
          </div>

          <GbExplorerPanel initialMaterialId={materialId} />
        </section>

        {/* ── Downstream Pipeline Workflow ── */}
        <NewWorkflow />
      </div>
    </>
  );
}
