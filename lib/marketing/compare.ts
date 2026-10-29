export type CompareRow = {
  name: string;
  manager: string;
  spend: number;
  booked: number;
  costPerBooked: number | null;
  flag: "" | "Outlier" | "Junk traffic";
  reason: string;
  openDecisions: number;
};

export function compareClients(input: {
  clients: { name: string; manager: string; spend: number; booked: number; junk?: boolean; openDecisions?: number }[];
  minSpend?: number;
}) {
  const minSpend = input.minSpend ?? 500;
  const costs = input.clients
    .map((row) => (row.booked > 0 ? row.spend / row.booked : null))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const median = costs.length ? costs[Math.floor((costs.length - 1) / 2)]! : null;
  const rows: CompareRow[] = input.clients.map((row) => {
    const costPerBooked = row.booked > 0 ? row.spend / row.booked : null;
    const outlier = Boolean(median && costPerBooked && row.spend >= minSpend && costPerBooked > median * 2);
    const flag = row.junk ? "Junk traffic" : outlier ? "Outlier" : "";
    const reason = outlier && median && costPerBooked ? `${(costPerBooked / median).toFixed(1)}× the median` : row.junk ? "Traffic quality check" : "";
    return {
      name: row.name,
      manager: row.manager,
      spend: row.spend,
      booked: row.booked,
      costPerBooked,
      flag,
      reason,
      openDecisions: row.openDecisions ?? 0,
    };
  });
  return {
    median,
    clients: rows.length,
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    booked: rows.reduce((sum, row) => sum + row.booked, 0),
    flagged: rows.filter((row) => row.flag).length,
    rows,
  };
}

export function compareCsv(rows: CompareRow[]) {
  const lines = ["Flag,Client,Account manager,Spend,Booked calls,Cost per booked call,Reason,Open decisions"];
  for (const row of rows) {
    lines.push([row.flag, row.name, row.manager, row.spend.toFixed(2), row.booked, row.costPerBooked?.toFixed(2) ?? "", row.reason, row.openDecisions].join(","));
  }
  return lines.join("\n");
}
