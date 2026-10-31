"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type TreeRow = {
  id: string;
  name: string;
  href: string;
  cells: string[];
  children?: TreeRow[];
};

export function ChannelTable({ rows }: { rows: TreeRow[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ harbor: true, retirees: true });
  const render = (row: TreeRow, depth: number): ReactNode => {
    const expanded = Boolean(open[row.id]);
    return (
      <>
        <tr key={row.id} className={depth === 1 ? "lv1" : depth === 2 ? "lv2" : undefined}>
          <td>
            {row.children?.length ? (
              <button
                type="button"
                className="exp"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name}`}
                onClick={() => setOpen((state) => ({ ...state, [row.id]: !state[row.id] }))}
              >
                {expanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="exp" />
            )}
            <Link href={row.href}>{row.name}</Link>
          </td>
          {row.cells.map((cell) => (
            <td key={cell}>{cell}</td>
          ))}
        </tr>
        {expanded && row.children?.map((child) => render(child, depth + 1))}
      </>
    );
  };
  return (
    <table>
      <thead>
        <tr>
          <th>Campaign / ad set / ad</th>
          <th>Spend</th>
          <th>Leads</th>
          <th>CPL</th>
          <th>CTR</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>{rows.map((row) => render(row, 0))}</tbody>
    </table>
  );
}
