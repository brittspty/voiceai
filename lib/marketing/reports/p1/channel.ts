import { forReader, type P1Reader } from "../../p1-reader";
import { loadStaffReport } from "../load";
import type { StaffReport } from "../types";

export function channelFromReport(staff: StaffReport, channelId: string, reader: P1Reader) {
  const row = staff.channels.find((item) => item.id === channelId);
  if (!row) return null;
  const qualified = staff.series.find((item) => item.id === "qualified");
  const points = (qualified?.points ?? []).map((point) => {
    const split = point.splits.find((item) => item.staffName === row.staffName);
    return { date: point.date, label: point.label, value: split?.value ?? 0 };
  });
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA",
      id: row.id,
      name: reader === "staff" ? row.staffName : row.clientName,
      qualified: row.qualified,
      leads: row.leads,
      booked: row.booked,
      cpl: row.cpl,
      points,
      tableCaption: "Qualified leads by day",
    },
    reader,
  );
}

export async function buildChannelReport(channelId: string, reader: P1Reader) {
  const staff = await loadStaffReport({ range: "30d", compare: "prior", clientId: "all" });
  return channelFromReport(staff, channelId, reader);
}
