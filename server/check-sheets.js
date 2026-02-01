/**
 * Verify Google Sheets API access: auth, sheet exists, and "Orders" tab is readable.
 * Loads .env from project root when run from project root.
 *
 * Run from project root: npm run check:sheets
 */
import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_NAME = 'Orders';

async function check() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!sheetId) {
    console.error('❌ GOOGLE_SHEET_ID is not set (check .env or environment).');
    process.exit(1);
  }
  if (!credsJson) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS_JSON is not set (check .env or environment).');
    process.exit(1);
  }

  let credentials;
  try {
    let jsonStr = credsJson.trim();
    if ((jsonStr.startsWith("'") && jsonStr.endsWith("'")) || (jsonStr.startsWith('"') && jsonStr.endsWith('"'))) {
      jsonStr = jsonStr.slice(1, -1);
    }
    if (!jsonStr.startsWith('{')) {
      console.error('❌ GOOGLE_APPLICATION_CREDENTIALS_JSON should be the full JSON object (starts with {).');
      console.error('   In .env put it on a single line. If the value spans multiple lines, minify the JSON to one line.');
      process.exit(1);
    }
    credentials = JSON.parse(jsonStr);
  } catch (e) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON:', e.message);
    console.error('   In .env use the full service account JSON on one line (no line breaks inside the value).');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const { data: meta } = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log('✅ Spreadsheet found:', meta.properties?.title || '(no title)');

    const sheet = meta.sheets?.find((s) => s.properties?.title === SHEET_NAME);
    if (!sheet) {
      console.error(`❌ No sheet tab named "${SHEET_NAME}" found. Rename the first tab to "${SHEET_NAME}".`);
      process.exit(1);
    }
    console.log(`✅ Sheet tab "${SHEET_NAME}" found.`);

    const range = `${SHEET_NAME}!A2:H`;
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = data.values || [];
    console.log(`✅ Read access OK. Current orders (data rows): ${rows.length}.`);
    console.log('\nGoogle Sheets API access is configured correctly.');
  } catch (err) {
    if (err.code === 404 || err.message?.includes('404')) {
      console.error('❌ Spreadsheet not found. Check GOOGLE_SHEET_ID (the ID in the sheet URL).');
    } else if (err.code === 403 || err.message?.includes('403')) {
      console.error('❌ Permission denied. Share the Google Sheet with the service account email (Editor):', credentials.client_email);
    } else {
      console.error('❌ Google Sheets API error:', err.message || err);
    }
    process.exit(1);
  }
}

check();
