import { useState } from "react";

const CITATION_TEXT = `DislocationTrace: An Automated Pipeline for TEM Dislocation Trace Analysis and Burgers Vector Indexing [Software]. Mohan Kumar M, Yuvraj Singh, Kakarla Harshavardhan, Ankur Chauhan (2026). EEMG Lab, Indian Institute of Science (IISc). https://github.com/imyuvraj09/IISc-Research-Internshipp`;

/**
 * CitationContactCard
 * --------------------
 * A two-panel card (side-by-side on desktop, stacked on mobile) providing
 * citation copy and contact/contribution links.  Styled to match the
 * pipeline stage cards on the homepage.
 */
export default function CitationContactCard() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CITATION_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback for older browsers */
      const ta = document.createElement("textarea");
      ta.value = CITATION_TEXT;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* ── Left: Cite this tool ── */}
      <div className="rounded-lg border border-line bg-surface p-5 transition-colors hover:border-beam-300">
        <span className="font-mono text-xs text-beam-600">CITE</span>
        <h3 className="mt-1 text-[15px] font-semibold text-ink">
          Cite this tool
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          If you use Dislocation Trace in your research, please cite it.
        </p>

        {/* Citation box */}
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surfaceAlt p-3 font-mono text-xs leading-relaxed text-ink">
          DislocationTrace: An Automated Pipeline for TEM Dislocation Trace Analysis and Burgers Vector Indexing [Software]. Mohan Kumar M, Yuvraj Singh, Kakarla Harshavardhan, Ankur Chauhan (2026). EEMG Lab, Indian Institute of Science (IISc).{" "}
          <a
            href="https://github.com/imyuvraj09/IISc-Research-Internshipp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-beam-600 underline hover:text-beam-700 cursor-pointer"
          >
            https://github.com/imyuvraj09/IISc-Research-Internshipp
          </a>
        </pre>

        <button
          onClick={handleCopy}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-beam-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-beam-600"
        >
          {copied ? (
            <>
              {/* Checkmark icon */}
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Copied!
            </>
          ) : (
            <>
              {/* Copy icon */}
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy citation
            </>
          )}
        </button>
      </div>

      {/* ── Right: Contact & Contribute ── */}
      <div className="rounded-lg border border-line bg-surface p-5 transition-colors hover:border-beam-300">
        <span className="font-mono text-xs text-beam-600">CONNECT</span>
        <h3 className="mt-1 text-[15px] font-semibold text-ink">
          Contact &amp; Contribute
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Found a bug, have a feature request, or want to collaborate?
        </p>

        {/* Contact list */}
        <div className="mt-4 flex flex-col gap-2.5 text-sm">
          {/* LinkedIn – EEMG Lab */}
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-beam-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <a
              href="https://in.linkedin.com/company/extreme-environment-materials-group-iisc-bengaluru"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-beam-500 hover:underline"
            >
              EEMG Lab, IISc
            </a>
          </div>

          {/* Email – ankurchauhan */}
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-beam-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <a
              href="mailto:ankurchauhan@iisc.ac.in"
              className="font-medium text-beam-500 hover:underline"
            >
              ankurchauhan@iisc.ac.in
            </a>
          </div>

          {/* Email – mohanm */}
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-beam-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <a
              href="mailto:mohanm@iisc.ac.in"
              className="font-medium text-beam-500 hover:underline"
            >
              mohanm@iisc.ac.in
            </a>
          </div>

          {/* Email – kakarlaharshavardhan */}
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-beam-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <a
              href="mailto:kakarlaharshavardhan@gmail.com"
              className="font-medium text-beam-500 hover:underline"
            >
              kakarlaharshavardhan@gmail.com
            </a>
          </div>

          {/* Email – yuvrajsinghias */}
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-beam-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <a
              href="mailto:yuvrajsinghias09122004@gmail.com"
              className="font-medium text-beam-500 hover:underline"
            >
              yuvrajsinghias09122004@gmail.com
            </a>
          </div>
        </div>

        {/* GitHub issue button */}
        <a
          href="https://github.com/imyuvraj09/IISc-Research-Internshipp/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surfaceAlt"
        >
          <svg
            className="h-4 w-4"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.776.42-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.382 1.235-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.51 11.51 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.838 1.234 1.91 1.234 3.22 0 4.61-2.805 5.625-5.475 5.92.43.37.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .322.216.694.825.576C20.565 21.795 24 17.298 24 12 24 5.37 18.627 0 12 0z" />
          </svg>
          Open an Issue on GitHub ↗
        </a>
      </div>
    </div>
  );
}
