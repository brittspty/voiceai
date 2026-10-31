import { reportPdfLines } from "../client-view";
import type { ReportDocument } from "./types";

function pdfSafe(value: string) {
  return value
    .replaceAll("▲", "up ")
    .replaceAll("▼", "down ")
    .replaceAll("×", "x")
    .replaceAll("·", " | ")
    .replaceAll("–", "-")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function renderPdf(pages: string[][]) {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = add("<< /Type /Pages /Count 0 /Kids [] >>");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const commands = ["BT", "/F1 11 Tf", "54 740 Td", "14 TL"];
    for (const line of lines) {
      commands.push(`(${escapePdf(line)}) Tj`, "T*");
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    kids.push(pageId);
  }
  objects[pagesId - 1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(body);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

/** Light-theme export. Client documents are sealed before this runs. */
export function buildReportPdf(report: ReportDocument) {
  const lines = reportPdfLines(report).map(pdfSafe).filter((line) => line.trim().length > 0);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 40) pages.push(lines.slice(index, index + 40));
  if (!pages.length) pages.push(["Report"]);
  const withNumbers = pages.map((page, index) => [...page, `Page ${index + 1} of ${pages.length}`]);
  return Buffer.from(renderPdf(withNumbers), "latin1");
}
