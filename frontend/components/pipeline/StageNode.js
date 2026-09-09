/**
 * Node marker for the pipeline timeline.
 *
 * Styled as a diffraction spot on the beam column line, rather than a
 * generic numbered dot: a ring (the diffraction spot halo) around a solid
 * center (the transmitted/diffracted beam), matching what these images
 * actually look like in a real SAED pattern. The active stage "focuses"
 * with a soft glow instead of just changing color.
 */
export default function StageNode({ status, active }) {
  const solid =
    status === "complete" ? "bg-beam-500" : status === "in_progress" ? "bg-zone-500" : "bg-lineStrong";
  const ring =
    status === "complete"
      ? "border-beam-300"
      : status === "in_progress"
      ? "border-zone-400"
      : "border-line";

  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-surface transition-shadow ${ring} ${
        active ? "shadow-node" : ""
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full transition-colors ${solid}`} />
      {status === "complete" && (
        <svg
          viewBox="0 0 16 16"
          className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-beam-500 p-0.5 text-white"
        >
          <path
            d="M3 8.5 6.5 12 13 4"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
