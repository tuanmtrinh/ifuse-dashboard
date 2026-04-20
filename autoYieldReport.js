import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

import { parseEncodeFlag } from './utils/timeParser.js';
import { runConfig } from './utils/runConfig.js';
import { login } from './login.js';
import { parseArgs } from './utils/parseArgs.js';
import { getSchedules } from './utils/schedule.js';
import { pushToSheet } from "./pushToSheet.js";

/* ===============================
   VN Time Helper (IMPORTANT)
=============================== */
function getVNNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

/* ===============================
   Date Range Generator (UNCHANGED)
=============================== */

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

/* ===============================
   Parse CLI + ENV Args (UPDATED)
=============================== */

const cliArgs = parseArgs(process.argv.slice(2));

const args = {
  ifuse: cliArgs.ifuse || process.env.IFUSE,
  config: cliArgs.config || process.env.CONFIG,
  all: cliArgs.all || process.env.ALL === "true",
  time: cliArgs.time || process.env.TIME,
  timestart: cliArgs.timestart || process.env.TIME_START,
  timeend: cliArgs.timeend || process.env.TIME_END,
  "no-fail": cliArgs["no-fail"] || process.env.NO_FAIL === "true"
};

/* ===============================
   Assign args (UNCHANGED STYLE)
=============================== */

const loginFlag = args.ifuse;
const configArg = args.config;
const allFlag = args.all;
const timeArg = args.time;
const timeStart = args.timestart;
const timeEnd = args.timeend;
const noFailFlag = args["no-fail"];

/* ===============================
   Debug (NEW)
=============================== */

console.log("ENV CONFIG:");
console.log({
  ifuse: loginFlag,
  config: configArg,
  all: allFlag,
  time: timeArg,
  timestart: timeStart,
  timeend: timeEnd,
  noFail: noFailFlag
});

/* ===============================
   Determine Time Mode (MINIMAL CHANGE)
=============================== */

let encodeValues = [];
let rangeMode = false;
let schedules = []; // ✅ NEW

if (!timeArg && !timeStart && !timeEnd) {
  // ✅ SCHEDULE MODE
  const now = getVNNow();
  schedules = getSchedules(now);

  if (!schedules.length) {
    console.log("🟡 No scheduled run at this hour. Exiting.");
    process.exit(0);
  }

} else {

  // === EXISTING LOGIC (UNCHANGED) ===

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
}

/* ===============================
   Determine Config List (UNCHANGED)
=============================== */

if (!allFlag && !configArg) {
  console.error("❌ Missing config. Use --config or --all");
  process.exit(1);
}

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
   Load Config Files (UNCHANGED)
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
   Launch Browser (SMALL HARDENING)
=============================== */

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'] // ✅ NEW
});

const context = await browser.newContext({
  ignoreHTTPSErrors: true
});

await login(context, loginFlag);

/* ===============================
   Run Mode Switch (MINIMAL CHANGE)
=============================== */

if (schedules.length) {

  // ✅ SCHEDULE MODE
  for (const sch of schedules) {

    const { timeFrom, timeTo } = sch;

    console.log(`\n=====================================`);
    console.log(`Schedule: ${sch.label}`);
    console.log(`Time: ${timeFrom} → ${timeTo}`);
    console.log(`=====================================`);

    for (const cfg of configs) {

      console.log(`Running config: ${cfg.name}`);

      await runConfig({
        context,
        configName: cfg.name,
        config: cfg.data,
        timeFrom,
        timeTo,
        encodeValue: sch.label,
        skipTrueFail: noFailFlag,
        returnRows: false
      });

      // ✅ NEW: push summary to Google Sheets
      try {
        const sheetName = `${cfg.name}_${sch.label}`;

        await pushToSheet(
          [{
            time: new Date().toISOString(),
            config: cfg.name,
            yield: 0,   // placeholder (next step we extract real)
            fail: 0
          }],
          sheetName
        );

        console.log(`📤 Pushed to sheet: ${sheetName}`);

      } catch (err) {
        console.error(`❌ Failed to push sheet for ${cfg.name}_${sch.label}:`, err.message);
      }

    }

  }

} else {

  // === EXISTING FLOW (UNCHANGED) ===

  const combinedRows = {};

  if (rangeMode) {
    for (const cfg of configs) {
      combinedRows[cfg.name] = [];
    }
  }

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

}

await browser.close();

console.log("\n✅ All configs finished");
