import { useCallback, useRef, useState } from "react";

/**
 * Minimal drag-and-drop + click-to-browse upload target.
 * Reports selected files up via onFiles; does not perform any upload
 * itself (that's the caller's job, via lib/api.js).
 */
export default function FileDropzone({ label, accept, onFiles, files = [] }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
    },
    [onFiles]
  );

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? "border-beam-500 bg-beam-50"
            : "border-line bg-surfaceAlt hover:border-lineStrong"
        }`}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          className="text-subtle"
        >
          <path
            d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-muted">
          Drag &amp; drop, or <span className="text-beam-600 underline">browse</span>
        </p>
        <p className="text-xs text-subtle">{accept}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && onFiles(Array.from(e.target.files))}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md bg-surfaceAlt px-3 py-2 text-xs text-muted"
            >
              <span className="truncate font-mono">{f.name}</span>
              <span className="ml-3 shrink-0 text-subtle">
                {(f.size / 1024).toFixed(0)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
