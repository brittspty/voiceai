import { forReader, type P1Reader } from "../p1-reader";

export const LINEAGE_LEVELS = ["source", "segment", "subsegment", "audience", "leads", "conversions"] as const;
export type LineageLevel = (typeof LINEAGE_LEVELS)[number];

const TITLES: Record<LineageLevel, string> = {
  source: "Source",
  segment: "Segment (campaign)",
  subsegment: "Sub-segment (ad set)",
  audience: "Audience",
  leads: "Leads",
  conversions: "Conversions",
};

type Node = {
  id: string;
  label: string;
  count: number;
  vendor?: string;
  listId?: string;
  children?: Node[];
};

const TREE: Node[] = [
  {
    id: "ex-market",
    label: "Example Market",
    count: 10000,
    vendor: "Example Vendor",
    listId: "ex-100",
    children: [
      {
        id: "ex-campaign",
        label: "Example Campaign",
        count: 6400,
        children: [
          {
            id: "ex-adset",
            label: "Example Ad Set",
            count: 4000,
            children: [
              {
                id: "ex-audience-a",
                label: "Example Audience A",
                count: 2500,
                children: [
                  {
                    id: "ex-leads-a",
                    label: "Example leads A",
                    count: 500,
                    children: [{ id: "ex-conv-a", label: "Verified conversions A", count: 120 }],
                  },
                ],
              },
              {
                id: "ex-audience-b",
                label: "Example Audience B",
                count: 1500,
                children: [
                  {
                    id: "ex-leads-b",
                    label: "Example leads B",
                    count: 180,
                    children: [{ id: "ex-conv-b", label: "Verified conversions B", count: 30 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ex-campaign-b",
        label: "Example Campaign B",
        count: 3600,
        children: [
          {
            id: "ex-adset-b",
            label: "Example Ad Set B",
            count: 3600,
            children: [
              {
                id: "ex-audience-c",
                label: "Example Audience C",
                count: 3600,
                children: [
                  {
                    id: "ex-leads-c",
                    label: "Example leads C",
                    count: 240,
                    children: [{ id: "ex-conv-c", label: "Verified conversions C", count: 48 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "sample-pool",
    label: "Sample Pool",
    count: 4000,
    vendor: "Sample Vendor",
    listId: "ex-200",
    children: [
      {
        id: "sample-campaign",
        label: "Sample Campaign",
        count: 4000,
        children: [
          {
            id: "sample-adset",
            label: "Sample Ad Set",
            count: 4000,
            children: [
              {
                id: "sample-audience",
                label: "Sample Audience",
                count: 4000,
                children: [
                  {
                    id: "sample-leads",
                    label: "Sample leads",
                    count: 220,
                    children: [{ id: "sample-conv", label: "Sample conversions", count: 40 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export type LineageSelection = Partial<Record<LineageLevel, string>>;

function childrenOf(nodes: Node[] | undefined, id: string | undefined) {
  return nodes?.find((node) => node.id === id) ?? nodes?.[0];
}

export function resolveLineageSelection(query: LineageSelection = {}) {
  const source = childrenOf(TREE, query.source)!;
  const segment = childrenOf(source.children, query.segment)!;
  const subsegment = childrenOf(segment.children, query.subsegment)!;
  const audience = childrenOf(subsegment.children, query.audience)!;
  const leads = childrenOf(audience.children, query.leads)!;
  const conversions = childrenOf(leads.children, query.conversions)!;
  return {
    source: source.id,
    segment: segment.id,
    subsegment: subsegment.id,
    audience: audience.id,
    leads: leads.id,
    conversions: conversions.id,
  };
}

export function lineageHref(selection: LineageSelection) {
  const params = new URLSearchParams();
  for (const level of LINEAGE_LEVELS) {
    const value = selection[level];
    if (value) params.set(level, value);
  }
  const search = params.toString();
  return search ? `/audience-data/lineage?${search}` : "/audience-data/lineage";
}

export function lineageChoiceHref(level: LineageLevel, selection: ReturnType<typeof resolveLineageSelection>, nodeId: string) {
  const next: LineageSelection = {};
  for (const key of LINEAGE_LEVELS) {
    if (key === level) {
      next[key] = nodeId;
      break;
    }
    next[key] = selection[key];
  }
  return lineageHref(next);
}

function columnNodes(level: LineageLevel, picked: ReturnType<typeof resolveLineageSelection>): Node[] {
  if (level === "source") return TREE;
  const source = childrenOf(TREE, picked.source)!;
  if (level === "segment") return source.children ?? [];
  const segment = childrenOf(source.children, picked.segment)!;
  if (level === "subsegment") return segment.children ?? [];
  const subsegment = childrenOf(segment.children, picked.subsegment)!;
  if (level === "audience") return subsegment.children ?? [];
  const audience = childrenOf(subsegment.children, picked.audience)!;
  if (level === "leads") return audience.children ?? [];
  const leads = childrenOf(audience.children, picked.leads)!;
  return leads.children ?? [];
}

function parentCount(level: LineageLevel, picked: ReturnType<typeof resolveLineageSelection>) {
  if (level === "source") return TREE.reduce((sum, node) => sum + node.count, 0);
  const source = childrenOf(TREE, picked.source)!;
  if (level === "segment") return source.count;
  const segment = childrenOf(source.children, picked.segment)!;
  if (level === "subsegment") return segment.count;
  const subsegment = childrenOf(segment.children, picked.subsegment)!;
  if (level === "audience") return subsegment.count;
  const audience = childrenOf(subsegment.children, picked.audience)!;
  if (level === "leads") return audience.count;
  const leads = childrenOf(audience.children, picked.leads)!;
  return leads.count;
}

export function presentLineage(reader: P1Reader, query: LineageSelection = {}) {
  const picked = resolveLineageSelection(query);
  const source = childrenOf(TREE, picked.source)!;
  const columns = LINEAGE_LEVELS.map((level, index) => {
    const parent = parentCount(level, picked);
    return {
      id: level,
      step: index + 1,
      title: TITLES[level],
      nodes: columnNodes(level, picked).map((node) => ({
        id: node.id,
        label: node.label,
        count: node.count,
        shareOfParent: parent > 0 ? node.count / parent : 0,
        selected: node.id === picked[level],
        href: lineageChoiceHref(level, picked, node.id),
        ...(reader === "staff" && node.vendor ? { vendor: node.vendor, listId: node.listId } : {}),
      })),
    };
  });
  const path = columns.map((column) => {
    const node = column.nodes.find((item) => item.selected) ?? column.nodes[0];
    return `${column.title} ${node?.label ?? ""}`.trim();
  });
  const basedOn = reader === "staff"
    ? `Based on: EXAMPLE DATA. ${source.vendor} list ${source.listId}. Verified-human conversions only.`
    : "Based on: EXAMPLE DATA. Verified-human conversions on this path.";
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA",
      path,
      pathSummary: path.join(" > "),
      basedOn,
      columns,
      mobile: "stepper" as const,
    },
    reader,
  );
}
