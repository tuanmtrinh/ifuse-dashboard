console.log("🔥 NEW VERSION RUNNING");
console.log("🔥 SHEET ID:", "19HvYQbJ4lqgPND9AB1yvqeOaAh_de-I5V9YsK3BsFt8");

import { google } from "googleapis";

export async function pushToSheet(data) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = "19HvYQbJ4lqgPND9AB1yvqeOaAh_de-I5V9YsK3BsFt8";

  console.log("🚨 SHEET ID:", spreadsheetId);

  const values = data.map(row => [
    row.time,
    row.config,
    row.yield,
    row.fail,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "RAW_DATA!A2",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}
