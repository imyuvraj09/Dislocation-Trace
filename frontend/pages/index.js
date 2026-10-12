import Head from "next/head";
import Link from "next/link";
import CitationContactCard from "@/components/ui/CitationContactCard";

export default function Home() {
  return (
    <>
      <Head>
        <title>Dislocation Trace — automated TEM dislocation trace analysis</title>
      </Head>

      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-beam-600">
              Open-source · crystallographic image analysis
            </p>
            <h1 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              From raw TEM micrographs to indexed dislocation lines.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
              DislocationTrace combines TEM images and indexed diffraction
              information from two specimen orientations to reconstruct
              three-dimensional dislocation-line directions. Its guided
              workflow supports Burgers-vector identification,
              dislocation-character classification and slip-plane
              determination, with exportable results for multiple dislocation
              segments.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/pipeline"
                className="rounded-md bg-beam-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-beam-600"
              >
                Open the pipeline
              </Link>

              <a
                href="https://docs.google.com/document/d/1zASoiXdGDQl2td728cl5bUZZwhbeCcWi/edit?usp=drive_link&ouid=101147543832362114658&rtpof=true&sd=true"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
              >
                User Manual
              </a>
            </div>
          </div>

          {/* Signature visual: a schematic beam column with diffraction
              spots, previewing the same node motif used in the pipeline. */}
          <div className="flex justify-center">
            <svg viewBox="0 0 220 220" className="h-56 w-56">
              <circle
                cx="110"
                cy="110"
                r="90"
                fill="none"
                stroke="#E1E5EA"
                strokeWidth="1"
              />
              <circle
                cx="110"
                cy="110"
                r="60"
                fill="none"
                stroke="#E1E5EA"
                strokeWidth="1"
              />
              <line
                x1="110"
                y1="10"
                x2="110"
                y2="210"
                stroke="#E1E5EA"
                strokeWidth="1"
              />
              <line
                x1="10"
                y1="110"
                x2="210"
                y2="110"
                stroke="#E1E5EA"
                strokeWidth="1"
              />
              <circle cx="110" cy="110" r="7" fill="#12938A" />
              {[
                [110, 50],
                [110, 170],
                [50, 110],
                [170, 110],
                [70, 70],
                [150, 150],
                [70, 150],
                [150, 70],
              ].map(([cx, cy], i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={i % 2 === 0 ? 5 : 3.5}
                  fill={i % 2 === 0 ? "#3768D6" : "#7FDBD3"}
                />
              ))}
            </svg>
          </div>
        </div>
      </section>

      {/* Stage overview -- numbered because this really is a strict,
          ordered pipeline: each stage consumes the previous stage's output. */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="text-xl font-semibold text-ink">The nine stages</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">
          Each stage has its own upload, form, or results table. Run them in
          order from the pipeline page.
        </p>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 1, title: "Crystal Structure and Lattice Parameters", summary: "Select the crystal structure and enter the required lattice parameters." },
            { id: 2, title: "Image Upload and Alignment", summary: "Upload TEM micrographs and corresponding diffraction patterns, and set the image\u2013diffraction rotational offset." },
            { id: 3, title: "Zone-axis and Diffraction Indexing", summary: "Enter the zone axes and assign crystallographic indices to selected diffraction vectors." },
            { id: 4, title: "Dislocation-trace Marking and Pairing", summary: "Mark trace endpoints and pair the same physical segment across the two specimen orientations." },
            { id: 5, title: "Diffraction-vector Selection and Angle Measurement", summary: "Select three diffraction vectors for each projection and calculate their angles with the projected trace." },
            { id: 6, title: "Projected-trace Direction Determination", summary: "Determine the projected line directions, u_p,1 and u_p,2, in the crystal coordinate system." },
            { id: 7, title: "True Line-direction Reconstruction", summary: "Combine the two projections to reconstruct the three-dimensional dislocation-line direction, u_T." },
            { id: 8, title: "Burgers-vector Assignment", summary: "Enter an independently established Burgers vector or use the optional diffraction-invisibility module to identify candidate directions." },
            { id: 9, title: "Dislocation Character, Slip Plane and Export", summary: "Calculate dislocation character and compatible slip-plane orientations, review crystallographic indices and angular deviations, and export the results." },
          ].map((stage) => (
            <li
              key={stage.id}
              className="rounded-lg border border-line bg-surface p-5 transition-colors hover:border-beam-300"
            >
              <span className="font-mono text-xs text-beam-600">
                {String(stage.id).padStart(2, "0")}
              </span>
              <h3 className="mt-1 text-[15px] font-semibold text-ink">
                {stage.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {stage.summary}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Citation & Contact */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <CitationContactCard />
      </section>
    </>
  );
}
