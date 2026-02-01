/**
 * One-time setup: ensure the Orders sheet has a header row.
 * Run: GOOGLE_SHEET_ID=xxx GOOGLE_APPLICATION_CREDENTIALS_JSON='{...}' node server/init-sheet.js
 */
import { google } from 'googleapis';

const SHEET_NAME = 'Orders';

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!sheetId || !credsJson) {
    console.error('Set GOOGLE_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON');
    process.exit(1);
  }
  const credentials = JSON.parse(credsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const headers = [['customerName', 'status', 'created_at', 'completed_at', 'subtotal', 'tax', 'grand_total', 'items']];
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A1:H1`,
    valueInputOption: 'RAW',
    requestBody: { values: headers },
  });
  console.log('Orders sheet header row written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
