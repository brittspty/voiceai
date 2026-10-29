import { readFileSync } from "node:fs";
import path from "node:path";
import { parseLabeledCsv, scoreLabeledRows } from "../lib/marketing/lead-score/csv";

const file = path.resolve(process.argv[2] || "fixtures/lead-quality/labeled.csv");
const rows = parseLabeledCsv(readFileSync(file, "utf8"));
scoreLabeledRows(rows)
  .then((report) => {
    const percent = (report.accuracy * 100).toFixed(1);
    console.log(`Labeled: ${report.total}`);
    console.log(`Correct: ${report.correct}`);
    console.log(`Accuracy: ${percent}%`);
    for (const row of report.breakdown) {
      console.log(`${row.label}: ${row.correct}/${row.total}`);
    }
    if (report.misses.length) {
      console.log("Misses:");
      for (const miss of report.misses) {
        console.log(`  ${miss.id} expected ${miss.expected} got ${miss.actual} — ${miss.reason}`);
      }
    }
    if (report.accuracy < 0.8) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
