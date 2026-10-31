/** Product fixtures keep EXAMPLE DATA. The demo tenant says DEMO DATA. */
export function dataChipLabel(surface: "product" | "demo") {
  return surface === "demo" ? "DEMO DATA" : "EXAMPLE DATA";
}
