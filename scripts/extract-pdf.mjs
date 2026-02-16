// Standalone PDF text extractor - called from API route via child process
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Must set worker before importing
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Point to the actual worker file
const workerPath = join(__dirname, "..", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
GlobalWorkerOptions.workerSrc = workerPath;

const filePath = process.argv[2];
if (!filePath) {
  process.stdout.write(JSON.stringify({ error: "No file path provided" }));
  process.exit(1);
}

try {
  const data = readFileSync(filePath);
  const doc = await getDocument({ data: new Uint8Array(data), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  process.stdout.write(JSON.stringify({ text: pages.join("\n"), numPages: doc.numPages }));
} catch (e) {
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
}
