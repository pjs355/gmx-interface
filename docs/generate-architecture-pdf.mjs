import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "architecture-overview.html");
const pdfPath = path.join(__dirname, "architecture-overview.pdf");

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

const browser = await puppeteer.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const nodes = document.querySelectorAll(".mermaid");
      if (nodes.length === 0) return false;
      return Array.from(nodes).every((node) => node.querySelector("svg") !== null);
    },
    { timeout: 60_000 },
  );
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" },
  });
  console.log(`Wrote ${pdfPath}`);
} catch (err) {
  console.error("error", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
