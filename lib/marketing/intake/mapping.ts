export type ColumnMap = {
  column: string;
  field: string;
  required?: boolean;
};

export type MappedRow = Record<string, string> & { __row: string };

export function applyMapping(headers: string[], rows: string[][], maps: ColumnMap[]): MappedRow[] {
  const index = new Map(headers.map((header, position) => [header.trim().toLowerCase(), position]));
  return rows.map((row, position) => {
    const mapped: MappedRow = { __row: String(position + 2) };
    for (const map of maps) {
      const at = index.get(map.column.trim().toLowerCase());
      mapped[map.field] = at === undefined ? "" : (row[at] ?? "").trim();
    }
    return mapped;
  });
}

export function mappingFields(maps: ColumnMap[]) {
  return maps.map((map) => ({
    column: map.column.trim(),
    field: map.field.trim(),
    required: Boolean(map.required),
  }));
}
