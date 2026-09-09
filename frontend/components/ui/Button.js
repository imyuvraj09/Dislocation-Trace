const VARIANTS = {
  primary:
    "bg-beam-500 text-white hover:bg-beam-600 disabled:bg-beam-500/50",
  secondary:
    "bg-surface text-ink border border-line hover:border-lineStrong disabled:opacity-50",
  ghost: "text-beam-600 hover:bg-beam-50 disabled:opacity-50",
};

export default function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
