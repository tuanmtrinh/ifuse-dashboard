import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

import { parseEncodeFlag } from './utils/timeParser.js';
import { runConfig } from './utils/runConfig.js';
import { login } from './login.js';
import { parseArgs } from './utils/parseArgs.js';

function generateDateRange(start, end) {

  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) {
    throw new Error("timestart/timeend must be YYMMDD");
  }

  const parse = s => new Date(
    2000 + Number(s.slice(0,2)),
    Number(s.slice(2,4)) - 1,
    Number(s.slice(4,6))
  );

  const format = d => {
    const y = String(d.getFullYear()).slice(2);
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}${m}${day}`;
  };

  const result = [];

  let current = parse(start);
  const last = parse(end);

  while (current <= last) {

    // skip Sunday
    if (current.getDay() !== 0) {
      result.push(`${format(current)}PM`);
    }

    current.setDate(current.getDate()+1);

  }

  return result;

}

/* ===============================
   Setup Paths
=============================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FOLDER = path.join(__dirname, 'configs');
const AUTH_FILE = path.join(__dirname, 'auth.json');

/* ===============================
   Parse CLI Args
=============================== */

const args = parseArgs(process.argv.slice(2));

const loginFlag = args.ifuse;
const configArg = args.config;
const allFlag = args.all;
const timeArg = args.time;
const timeStart = args.timestart;
const timeEnd = args.timeend;
const noFailFlag = args["no-fail"];

if (!allFlag && !configArg) {
  console.error("❌ Usage:");
  console.error("node autoYieldReport.js --config bz5,bz7 --time YYMMDDAM|PM");
  console.error("or");
  console.error("node autoYieldReport.js --all --time YYMMDDAM|PM");
  console.error("or");
  console.error("node autoYieldReport.js --config bz5 --timestart YYMMDD --timeend YYMMDD");
  process.exit(1);
}

let encodeValues = [];
let rangeMode = false;

if (timeStart || timeEnd) {

  if (!timeStart || !timeEnd) {
    console.error("❌ timestart and timeend must be used together");
    process.exit(1);
  }

  const start = timeStart;
  const end = timeEnd;

  encodeValues = generateDateRange(start, end);
  rangeMode = true;

} else {

  if (!timeArg) {
    console.error("❌ Missing --time flag");
    process.exit(1);
  }

  const singleEncode = timeArg.toUpperCase();

  const year = 2000 + parseInt(singleEncode.slice(0,2));
  const month = parseInt(singleEncode.slice(2,4)) - 1;
  const day = parseInt(singleEncode.slice(4,6));

  const date = new Date(year, month, day);

  if (date.getDay() === 0) {
    console.error("❌ Sunday shifts are not valid. Use Monday instead.");
    process.exit(1);
  }

  encodeValues = [singleEncode];

}

if (!fs.existsSync(AUTH_FILE)) {
  console.error("❌ auth.json not found.");
  process.exit(1);
}

/* ===============================
   Determine Config List
=============================== */

let configNames = [];

if (allFlag) {

  const files = fs.readdirSync(CONFIG_FOLDER);

  configNames = files
    .filter(f => f.endsWith('.json'))
    .map(f => path.basename(f, '.json'));

} else {

  configNames = configArg.split(',');

}

console.log("Configs to run:", configNames.join(', '));

/* ===============================
   Load Config Files
=============================== */

const configs = [];

for (const name of configNames) {

  const configPath = path.join(CONFIG_FOLDER, `${name}.json`);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config not found: ${name}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  configs.push({
    name,
    data: config
  });
}

/* ===============================
   Launch Browser
=============================== */

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  ignoreHTTPSErrors: true
});

await login(context, loginFlag);

/* ===============================
   Prepare collectors (range mode)
=============================== */

const combinedRows = {};

if (rangeMode) {
  for (const cfg of configs) {
    combinedRows[cfg.name] = [];
  }
}

/* ===============================
   Run Configs Sequentially
=============================== */

for (const encodeValue of encodeValues) {

  const { timeFrom, timeTo } = parseEncodeFlag(encodeValue);

  console.log(`\n=====================================`);
  console.log(`Running time: ${encodeValue}`);
  console.log(`Time range: ${timeFrom} → ${timeTo}`);
  console.log(`=====================================`);

  for (const cfg of configs) {

    console.log(`\n------------------------------`);
    console.log(`Running config: ${cfg.data.name}`);
    console.log(`------------------------------`);

    const rows = await runConfig({
      context,
      configName: cfg.name,
      config: cfg.data,
      timeFrom,
      timeTo,
      encodeValue,
      skipTrueFail: noFailFlag,
      returnRows: rangeMode
    });

    if (rangeMode && rows) {
      for (const r of rows) {
        combinedRows[cfg.name].push([encodeValue, ...r]);
      }
    }

  }

}

/* ===============================
   Write combined reports
=============================== */

if (rangeMode) {

  const outputDir = path.join(__dirname, "output");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const cfg of configs) {

    const rows = combinedRows[cfg.name];

    if (!rows.length) continue;

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet([
      [
        "Date",
        "Route",
        "Station",
        "Input Qty",
        "First Pass",
        "Retest Pass",
        "Output Qty",
        "Defect Qty",
        "Skywalker Yield Rate",
        "F/R",
        "Retest Pass Rate"
      ],
      ...rows
    ]);

    XLSX.utils.book_append_sheet(wb, ws, "Report");

    const file = path.join(
      outputDir,
      `${cfg.name}_${encodeValues[0]}_${encodeValues[encodeValues.length-1]}.xlsx`
    );

    XLSX.writeFile(wb, file);

    console.log(`✅ Combined report generated: ${file}`);

  }

}

await browser.close();

console.log("\n✅ All configs finished");
