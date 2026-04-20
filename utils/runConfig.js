import XLSX from "xlsx";
import path from "path";
import fs from "fs";

async function retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts - 1) throw e;
      console.log(`Retry ${i + 1}...`);
    }
  }
}

/* ===============================
   Run One Config
=============================== */

export async function runConfig({
  context,
  configName,
  config,
  timeFrom,
  timeTo,
  encodeValue,
  skipTrueFail = false,
  returnRows = false
}) {

  const page = await context.newPage();

  await page.goto(
    "https://sfcweb2.gg.ftv/MDReport/QualityReportGLFac.aspx",
    {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }
  );

  await page.evaluate(() => {

    window.__mesFetchJSON = async (url, body) => {

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(body)
      });

      return await res.json();

    };

  });

  const allRows = [];

  const routeRowMap = {};
  let failStartRow = null;
  let failEndRow = null;

  for (const req of config.requests) {

    console.log(`Processing route: ${req.label}`);

    const payload = {
      ...req.payload,
      timeFrom,
      timeTo
    };

    try {

      const json = await retry(() =>
        page.evaluate(async ({ endpoint, body }) => {
          return await window.__mesFetchJSON(endpoint, body);
        }, {
          endpoint: config.api.endpoint,
          body: payload
        })
      );

      if (!json?.d) {
        console.warn(`⚠ No data for route: ${req.label}`);
        continue;
      }

      const rawData = JSON.parse(json.d);

      const stationMap = new Map();

      for (const row of rawData) {
        stationMap.set(row.GROUP_NAME, row);
      }

      routeRowMap[req.label] = [];

      for (const station of req.stations) {

        const row = stationMap.get(station) || {};

        const input = Number(row.COUNT_TOTAL ?? 0);
        const firstPass = Number(row.FIRST_PASS ?? 0);
        const retestPass = Number(row.RETEST_PASS ?? 0);
        const output = Number(row.FINAL_PASS ?? 0);
        const fail = Number(row.FINAL_FAIL ?? 0);

        const yieldRowNumber = allRows.length + 2;

        routeRowMap[req.label].push(yieldRowNumber);

        allRows.push([
          req.label,
          station,
          input,
          firstPass,
          retestPass,
          output,
          fail,
          "",
          "",
          ""
        ]);

      }

      const fpyRowNumber = allRows.length + 2;

      routeRowMap[req.label].push({
        fpyRow: fpyRowNumber
      });

      allRows.push([
        "",
        "FPY (Total)",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ]);

      /* ===============================
         TRUE FAIL DETAIL (MLB only)
      =============================== */

      if (req.label === "MLB" && !skipTrueFail) {

        console.log("Fetching TRUE FAIL with pagination...");

        const merged = [];
        const batchSize = 4; // number of pages to fetch in parallel
        let pageIndex = 1;
        const MAX_PAGES = 30; // safety limit to prevent infinite loops

        while (true) {

          console.log(`\n📦 Fetching batch starting at page ${pageIndex}`);

          if (pageIndex > MAX_PAGES) {
            console.warn("🛑 Reached MAX_PAGES limit, breaking to prevent infinite loop");
            break;
          }

          const pageBatch = [];

          for (let i = 0; i < batchSize; i++) {

            const currentPage = pageIndex + i;

            pageBatch.push(

              page.evaluate(async ({
                section,
                family,
                startTime,
                endTime,
                pageIndex
              }) => {

                return await window.__mesFetchJSON(
                  "https://sfcweb2.gg.ftv/services/WsGLCustomize.asmx/DetailFreshByPidFac",
                  {
                    section,
                    family,
                    startTime,
                    endTime,
                    group: "",
                    line: "",
                    model: "",
                    page: pageIndex,
                    style: "FINALFAIL",
                    wo: ""
                  }
                );

              }, {
                section: req.payload.section,
                family: req.payload.family,
                startTime: timeFrom,
                endTime: timeTo,
                pageIndex: currentPage
              })

            );

          }

          const results = await Promise.all(pageBatch);

          let emptyPages = 0;

          for (let i = 0; i < results.length; i++) {

            const res = results[i];
            const currentPage = pageIndex + i;

            if (!res?.d || !res.d[1]) {
              console.log(`⚠ Page ${currentPage}: missing data`);
              emptyPages++;
              continue;
            }

            let rows = [];

            try {
              rows = JSON.parse(res.d[1]);
            } catch (e) {
              console.log(`❌ Page ${currentPage}: JSON parse failed`);
              emptyPages++;
              continue;
            }

            if (!Array.isArray(rows) || rows.length === 0) {
              console.log(`📭 Page ${currentPage}: empty`);
              emptyPages++;
              continue;
            }

            console.log(`✅ Page ${currentPage}: ${rows.length} rows`);

            for (const r of rows) {

              if (!req.stations.includes((r.GROUP_NAME || "").trim())) continue;

              const time = (r.IN_STATION_TIME || "").replace("T", " ");

              merged.push([
                r.PID,
                r.WORK_ORDER,
                r.MODEL_NAME,
                time,
                r.LINE,
                r.GROUP_NAME,
                r.STATION_ID,
                "",
                r.ITEM_KEY,
                r.ITEM_NAME,
                r.LO_LIMIT,
                r.UP_LIMIT,
                r.READING
              ]);

            }

          }

          console.log(`Batch summary: ${emptyPages}/${batchSize} empty pages`);

          if (emptyPages > 0) {
            console.log("🛑 At least one page empty → stopping pagination");
            break;
          }

          pageIndex += batchSize;

        }

        console.log(`\n📊 Total TRUE FAIL rows collected: ${merged.length}`);

        merged.sort((a, b) => new Date(a[3]) - new Date(b[3]));

        if (merged.length) {

          allRows.push([]);
          allRows.push(["TRUE FAIL DETAIL"]);

          allRows.push([
            "PSN",
            "WO",
            "Model Name",
            "First In Station Time",
            "Line",
            "Group Name",
            "StationID",
            "CAL Station",
            "Key Name",
            "Item Name",
            "Lower Limit",
            "Upper Limit",
            "Measured Value"
          ]);

          failStartRow = allRows.length + 2;

          for (const r of merged) {
            allRows.push(r);
          }

          failEndRow = failStartRow + merged.length - 1;

        }

      }

      allRows.push([]);
      allRows.push([]);

    } catch (err) {

      console.error(`❌ Error processing route ${req.label}:`, err.message);

    }

  }

  /* ===============================
     Inject Excel formulas
  =============================== */

  for (const route in routeRowMap) {

    const entries = routeRowMap[route];

    const stationRows = entries.filter(v => typeof v === "number");

    const fpyObj = entries.find(v => typeof v === "object");

    const fpyRow = fpyObj.fpyRow;

    for (const r of stationRows) {

      const row = allRows[r - 2];

      if (route === "MLB" && failStartRow && failEndRow) {

        row[6] = {
          t: "n",
          f: `IFERROR(COUNTIF($F$${failStartRow}:$F$${failEndRow},B${r}),0)`
        };

      }

      row[7] = {
        t: "n",
        f: `IF(C${r}=0,1,(D${r}+E${r})/(D${r}+E${r}+G${r}))`,
        z: "0.00%"
      };

      row[8] = {
        t: "n",
        f: `1-H${r}`,
        z: "0.00%"
      };

      row[9] = {
        t: "n",
        f: `IF(C${r}=0,0,E${r}/C${r})`,
        z: "0.00%"
      };

    }

    const firstStation = stationRows[0];
    const lastStation = stationRows[stationRows.length - 1];

    const fpyExcelRow = fpyRow;
    const fpyArrayIndex = fpyExcelRow - 2;

    allRows[fpyArrayIndex][7] = {
      t: "n",
      f: `PRODUCT(H${firstStation}:H${lastStation})`,
      z: "0.00%"
    };

  }

  await page.close();

  if (returnRows) {
    return allRows;
  }

  /* ===============================
     METRIC EXTRACTION (NEW)
  =============================== */

  let totalFail = 0;
  let totalYieldProduct = 1;
  let hasYield = false;
  let inputSMT = 0;

  for (const row of allRows) {

    if (!Array.isArray(row)) continue;
    if (row.length < 7) continue;

    const route = row[0];
    const station = row[1];

    const input = Number(row[2] || 0);
    const firstPass = Number(row[3] || 0);
    const retestPass = Number(row[4] || 0);
    const fail = Number(row[6] || 0);

    // skip summary / empty rows
    if (!station || station === "FPY (Total)") continue;

    // ✅ INPUT: only SMT-FLASH (MLB)
    const metricDef = config.metrics?.input;
    
    if (
      metricDef &&
      route === metricDef.route &&
      station === metricDef.station
    ) {
      inputSMT = input;
    }

    // ✅ FAIL: sum all stations
    totalFail += fail;

    // ✅ YIELD per station
    const denom = firstPass + retestPass + fail;

    if (denom > 0) {
      const stationYield = (firstPass + retestPass) / denom;
      totalYieldProduct *= stationYield;
      hasYield = true;
    }

  }

  const finalYield = hasYield ? totalYieldProduct : 0;

  return {
    input: inputSMT,
    yield: finalYield,
    fail: totalFail
  };

  /* ===============================
     ORIGINAL EXCEL LOGIC BELOW (UNCHANGED)
  =============================== */

  const OUTPUT_DIR = path.join(
    process.cwd(),
    "output",
    encodeValue
  );

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const OUTPUT_FILE = path.join(
    OUTPUT_DIR,
    `${configName}_${encodeValue}.xlsx`
  );

  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([
    [
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
    ...allRows
  ]);

  XLSX.utils.book_append_sheet(wb, ws, "Report");

  XLSX.writeFile(wb, OUTPUT_FILE);

  console.log(`✅ Report generated: ${OUTPUT_FILE}`);

}
