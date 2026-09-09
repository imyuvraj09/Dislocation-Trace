/**
 * Generic, read-only results table.
 *
 * columns: [{ key, label, mono? }]
 * rows: array of plain objects keyed by column.key
 */
export default function DataTable({ columns, rows, emptyLabel = "No results yet." }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surfaceAlt px-4 py-8 text-center text-sm text-subtle">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-4 py-2.5 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              className="border-t border-line hover:bg-beam-50/40"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-4 py-2.5 text-ink ${
                    col.mono ? "font-mono text-[13px]" : ""
                  }`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
