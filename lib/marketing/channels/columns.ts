export type ChannelColumn = {
  id: string;
  label: string;
  glossaryId: string;
  cost: boolean;
};

const CHANNEL_COLUMNS: ChannelColumn[] = [
  { id: "name", label: "Campaign / ad set / ad", glossaryId: "", cost: false },
  { id: "spend", label: "Spend", glossaryId: "spend", cost: true },
  { id: "leads", label: "Leads", glossaryId: "leads", cost: false },
  { id: "cpl", label: "CPL", glossaryId: "cpl", cost: true },
  { id: "ctr", label: "CTR", glossaryId: "ctr", cost: false },
  { id: "status", label: "Status", glossaryId: "", cost: false },
];

/** Client columns drop spend and CPL, so those headers never get a cost tooltip. */
export function channelColumns(audience: "staff" | "client") {
  if (audience === "staff") return CHANNEL_COLUMNS;
  return CHANNEL_COLUMNS.filter((column) => !column.cost);
}
