import { google } from "googleapis";

export async function pushToSheet(data, sheetName) {

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = "19HvYQbJ4lqgPND9AB1yvqeOaAh_de-I5V9YsK3BsFt8";

  const values = data.map(row => [
    row.time,
    row.config,
    row.yield,
    row.fail,
  ]);

  // ✅ Ensure sheet exists
  await ensureSheetExists(sheets, spreadsheetId, sheetName);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A2`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}

/* ===============================
   Create sheet if not exists
=============================== */

async function ensureSheetExists(sheets, spreadsheetId, sheetName) {

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const exists = meta.data.sheets.some(
    s => s.properties.title === sheetName
  );

  if (exists) return;

  console.log(`🆕 Creating sheet: ${sheetName}`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }
      ]
    }
  });

  // Optional: add header
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["Time", "Config", "Yield", "Fail"]]
    }
  });

}
