import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

const SHEET_NAME = 'Orders';
const PORT = process.env.PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';

// Optional: serve static build (for Railway production)
if (!isDev) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
}

function getSheetsClient() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!sheetId || !credsJson) {
    throw new Error('Missing GOOGLE_SHEET_ID or GOOGLE_APPLICATION_CREDENTIALS_JSON');
  }
  let jsonStr = credsJson.trim();
  if ((jsonStr.startsWith("'") && jsonStr.endsWith("'")) || (jsonStr.startsWith('"') && jsonStr.endsWith('"'))) {
    jsonStr = jsonStr.slice(1, -1);
  }
  const credentials = JSON.parse(jsonStr);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, sheetId };
}

// Sheet columns: A=customerName, B=status, C=created_at, D=completed_at, E=subtotal, F=tax, G=grand_total, H=items(JSON)
// GET /api/orders — list all orders (for Barista + Owner views)
app.get('/api/orders', async (req, res) => {
  try {
    const { sheets, sheetId } = getSheetsClient();
    const range = `${SHEET_NAME}!A2:H`;
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = data.values || [];
    const orders = rows.map((row, i) => {
      const orderId = i + 2; // row number (2-based, row 1 = header)
      let items = [];
      try {
        items = row[7] ? JSON.parse(row[7]) : [];
      } catch (_) {}
      return {
        id: String(orderId),
        customerName: row[0] || 'Guest',
        status: row[1] || 'not_started',
        created_at: row[2] || null,
        completed_at: row[3] || null,
        subtotal: parseFloat(row[4]) || 0,
        tax: parseFloat(row[5]) || 0,
        grand_total: parseFloat(row[6]) || 0,
        items,
      };
    });
    // newest first
    orders.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders', err);
    res.status(500).json({ error: err.message || 'Failed to fetch orders' });
  }
});

// POST /api/orders — add new order (Customer checkout)
app.post('/api/orders', async (req, res) => {
  try {
    const { sheets, sheetId } = getSheetsClient();
    const { customerName, status, created_at, completed_at, subtotal, tax, grand_total, items } = req.body;
    const created = created_at || new Date().toISOString();
    const values = [[customerName, status || 'not_started', created, completed_at || '', subtotal, tax, grand_total, JSON.stringify(items || [])]];
    // Get current row count to know next order_id
    const { data: getData } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A2:H`,
    });
    const existingRows = (getData.values || []).length;
    const nextRow = existingRows + 2; // 1-based, + header
    const appendRange = `${SHEET_NAME}!A${nextRow}:H${nextRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: appendRange,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    res.status(201).json({ order_id: String(nextRow) });
  } catch (err) {
    console.error('POST /api/orders', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// PATCH /api/orders/:id — update order status (Barista: in_progress / completed)
app.patch('/api/orders/:id', async (req, res) => {
  try {
    const { sheets, sheetId } = getSheetsClient();
    const orderId = req.params.id;
    const row = parseInt(orderId, 10);
    if (isNaN(row) || row < 2) return res.status(400).json({ error: 'Invalid order id' });
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const completed = status === 'completed' ? new Date().toISOString() : '';
    const range = `${SHEET_NAME}!B${row}:D${row}`; // B=status, C=created_at, D=completed_at
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const existing = (data.values && data.values[0]) || [];
    const created_at = existing[1] || ''; // C = index 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[status, created_at, completed]] },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/orders/:id', err);
    res.status(500).json({ error: err.message || 'Failed to update order' });
  }
});

// SPA fallback (production)
if (!isDev) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
