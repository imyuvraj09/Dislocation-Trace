import { useEffect, useRef, useState } from "react";
import { parseVector } from "@/lib/gbExplorer";

/**
 * b-vector multi-select, ported from the standalone Explorer's
 * buildMultiSelect(): search-filterable checklist of the material's
 * Burgers-vector family, plus "add custom b-vector" for one typed in
 * directly (e.g. "1 2 0") that isn't already in the family.
 */
export default function GbMultiSelect({ options, selected, onChange, onAddCustom, placeholder = "Select b-vectors\u2026" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((opt) => opt.toLowerCase().includes(q));
  const parsedCustom = parseVector(query);
  const isCustomValid = parsedCustom && (parsedCustom.length === 3 || parsedCustom.length === 4);
  const customFormatted = isCustomValid
    ? parsedCustom.length === 4
      ? `${parsedCustom[0]}${parsedCustom[1]}${parsedCustom[2]}.${parsedCustom[3]}`
      : parsedCustom.join("")
    : null;
  const showAddCustom = isCustomValid && !options.includes(customFormatted);

  function toggle(val) {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  }

  function addCustom() {
    if (!showAddCustom) return;
    const label = onAddCustom(query);
    if (label && !selected.includes(label)) onChange([...selected, label]);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm cursor-pointer hover:border-lineStrong"
      >
        {selected.length ? (
          selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded bg-beam-50 px-1.5 py-0.5 font-mono text-xs text-beam-700">
              {s}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((v) => v !== s));
                }}
                className="text-beam-600 hover:text-beam-700"
              >
                {"\u00d7"}
              </button>
            </span>
          ))
        ) : (
          <span className="text-subtle">{placeholder}</span>
        )}
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-panel">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Search or enter custom b-vector (e.g. 1 2 0)..."
              className="w-full rounded border border-line px-2 py-1 text-xs focus:border-beam-500 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto scroll-thin">
            {showAddCustom && (
              <div
                onClick={addCustom}
                className="cursor-pointer border-b border-line px-3 py-2 text-xs text-beam-600 hover:bg-beam-50"
              >
                + Add custom Burgers vector &quot;{customFormatted}&quot;
              </div>
            )}
            {filtered.length === 0 && !showAddCustom && (
              <div className="px-3 py-3 text-center text-xs text-subtle">No options found</div>
            )}
            {filtered.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-surfaceAlt">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-beam-500" />
                <span className="font-mono">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
