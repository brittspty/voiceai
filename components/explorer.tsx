"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Search, SlidersHorizontal } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";

export type Column<T> = {
  id: string;
  header: string;
  className?: string;
  cell: (row: T) => React.ReactNode;
  defaultHidden?: boolean;
};

export function Explorer<T extends { id: string }>({
  rows,
  columns,
  storageKey,
  searchPlaceholder = "Search",
  menus = [],
  segments = [],
  date = false,
  total,
  page,
  perPage,
  emptyTitle,
  emptyBody,
  actions,
  onRow,
  trailing,
}: {
  rows: T[];
  columns: Column<T>[];
  storageKey: string;
  searchPlaceholder?: string;
  menus?: { param: string; label: string; options: { value: string; label: string }[] }[];
  segments?: { param: string; label?: string; options: { value: string; label: string }[] }[];
  date?: boolean;
  total: number;
  page: number;
  perPage: number;
  emptyTitle: string;
  emptyBody: string;
  actions?: React.ReactNode;
  onRow?: (row: T) => void;
  trailing?: (row: T) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [q, setQ] = useState(sp.get("q") || "");
  const [hidden, setHidden] = useState<string[]>(columns.filter((c) => c.defaultHidden).map((c) => c.id));

  useEffect(() => {
    const raw = localStorage.getItem(`cols:${storageKey}`);
    if (raw) setHidden(JSON.parse(raw) as string[]);
  }, [storageKey]);

  function writeHidden(next: string[]) {
    setHidden(next);
    localStorage.setItem(`cols:${storageKey}`, JSON.stringify(next));
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (!value || value === "any") params.delete(key);
    else params.set(key, value);
    if (key !== "page") params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((sp.get("q") || "") !== q) setParam("q", q);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const visible = columns.filter((c) => !hidden.includes(c.id));
  const pages = Math.max(1, Math.ceil(total / perPage));

  const pageHref = (nextPage: number, nextPer = perPage) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(nextPage));
    params.set("perPage", String(nextPer));
    return `${pathname}?${params.toString()}`;
  };

  const columnPicker = useMemo(
    () => (
      <Popover.Root>
        <Popover.Trigger className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-muted shadow-[var(--shadow)]">
          <Columns3 className="h-3.5 w-3.5" /> Columns
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="z-50 w-52 rounded-xl border border-line bg-card p-2 shadow-lg" align="end">
            {columns.map((column) => (
              <label key={column.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={!hidden.includes(column.id)}
                  onChange={(event) => {
                    const next = event.target.checked ? hidden.filter((id) => id !== column.id) : [...hidden, column.id];
                    writeHidden(next);
                  }}
                />
                {column.header}
              </label>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, columns],
  );

  return (
    <div>
      {actions && <div className="mb-3 flex justify-end gap-2">{actions}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-64 rounded-lg border border-line bg-card pl-8 pr-3 text-sm outline-none focus:border-zinc-400"
          />
        </label>
        <button type="button" onClick={() => setFiltersOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </button>
        <div className="ml-auto">{columnPicker}</div>
      </div>
      {filtersOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {menus.map((menu) => (
            <FilterMenu key={menu.param} label={menu.label} value={sp.get(menu.param) || "any"} options={menu.options} onChange={(value) => setParam(menu.param, value)} />
          ))}
          {segments.map((segment) => (
            <div key={segment.param} className="flex items-center gap-1 text-sm">
              {segment.label && <span className="mr-1 text-muted">{segment.label}</span>}
              {segment.options.map((option) => {
                const active = (sp.get(segment.param) || segment.options[0]?.value) === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => setParam(segment.param, option.value)} className={cn("rounded-full px-2.5 py-1", active ? "bg-ink text-white dark:bg-white dark:text-black" : "text-muted hover:bg-hover")}>
                    {option.label}
                  </button>
                );
              })}
            </div>
          ))}
          {date && (
            <Popover.Root>
              <Popover.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-sm text-muted">Date range</Popover.Trigger>
              <Popover.Content className="z-50 rounded-xl border border-line bg-card p-3 shadow-lg">
                <div className="flex gap-2">
                  <input type="date" defaultValue={sp.get("from") || ""} onChange={(event) => setParam("from", event.target.value)} className="rounded-md border border-line bg-transparent px-2 py-1 text-sm" />
                  <input type="date" defaultValue={sp.get("to") || ""} onChange={(event) => setParam("to", event.target.value)} className="rounded-md border border-line bg-transparent px-2 py-1 text-sm" />
                </div>
              </Popover.Content>
            </Popover.Root>
          )}
        </div>
      )}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] tracking-wide text-muted">
                {visible.map((column) => (
                  <th key={column.id} className={cn("px-4 py-3 font-medium", column.className)}>{column.header}</th>
                ))}
                {trailing && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} onClick={() => onRow?.(row)} className={cn("border-b border-line last:border-0", onRow && "cursor-pointer hover:bg-hover/60")}>
                  {visible.map((column) => (
                    <td key={column.id} className={cn("px-4 py-3 align-middle", column.className)}>{column.cell(row)}</td>
                  ))}
                  {trailing && <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>{trailing(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-6 py-16 text-center">
            <div className="font-medium">{emptyTitle}</div>
            <p className="mt-1 text-sm text-muted">{emptyBody}</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <div>Page {page} of {pages}</div>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select value={perPage} onChange={(event) => router.push(pageHref(1, Number(event.target.value)))} className="rounded-md border border-line bg-card px-2 py-1">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <a className={cn("rounded-md border border-line px-2 py-1", page <= 1 && "pointer-events-none opacity-40")} href={pageHref(1)}>«</a>
          <a className={cn("rounded-md border border-line px-2 py-1", page <= 1 && "pointer-events-none opacity-40")} href={pageHref(Math.max(1, page - 1))}>‹</a>
          <a className={cn("rounded-md border border-line px-2 py-1", page >= pages && "pointer-events-none opacity-40")} href={pageHref(Math.min(pages, page + 1))}>›</a>
          <a className={cn("rounded-md border border-line px-2 py-1", page >= pages && "pointer-events-none opacity-40")} href={pageHref(pages)}>»</a>
        </div>
      </div>
    </div>
  );
}

function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line px-3 text-sm text-muted">
        <span className="text-zinc-400">⊕</span> {label}{current && value !== "any" ? `: ${current.label}` : ""}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-50 min-w-40 rounded-xl border border-line bg-card p-1 shadow-lg">
          {[{ value: "any", label: "Any" }, ...options.filter((o) => o.value !== "any")].map((option) => (
            <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover", value === option.value && "font-medium")}>
              {option.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
