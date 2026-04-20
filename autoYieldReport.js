import { chromium } from "playwright";
import { pushToSheet } from "./pushToSheet.js";

async function runPlaywrightTest() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto("https://example.com");

  const title = await page.title();

  await browser.close();

  return [
    {
      time: new Date().toISOString(),
      config: "PW_TEST",
      yield: title.length,
      fail: 0,
    },
  ];
}

async function main() {
  const data = await runPlaywrightTest();
  await pushToSheet(data);
  console.log("✅ Playwright + Sheets OK");
}

main();
