/**
 * Append fake orders to the Orders sheet for testing Owner "yesterday" and "7d" views.
 * Run from project root: npm run seed:orders (requires .env with GOOGLE_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON)
 */
import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_NAME = 'Orders';
const TAX_RATE = 0.08875;

const MENU = {
  coffee: {
    Americano: { small: 3.0, large: 4.0 },
    Latte: { small: 4.0, large: 5.0 },
    'Cold Brew': { small: 4.0, large: 5.0 },
    Mocha: { small: 4.5, large: 5.5 }
  },
  tea: {
    'Black Tea': { small: 3.0, large: 3.75 },
    'Matcha Latte': { small: 4.5, large: 5.25 }
  },
  pastry: {
    'Plain Croissant': { price: 3.5 },
    'Chocolate Croissant': { price: 4.0 },
    'Chocolate Chip Cookie': { price: 2.5 }
  },
  add_ons: {
    'Oat Milk': 0.5,
    '1 Pump Caramel Syrup': 0.5
  }
};

function getItemLineTotal(item) {
  let basePrice = 0;
  if (MENU.pastry[item.base_item]) {
    basePrice = MENU.pastry[item.base_item].price;
  } else {
    const drink = MENU.coffee[item.base_item] || MENU.tea[item.base_item];
    const sizeKey = item.size?.toLowerCase?.().includes('small') ? 'small' : 'large';
    basePrice = drink ? (drink[sizeKey] ?? 0) : 0;
  }
  let mods = 0;
  Object.entries(item.modifications || {}).forEach(([mod, qty]) => {
    mods += (MENU.add_ons[mod] || 0) * qty;
  });
  return basePrice + mods;
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
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, sheetId };
}

function toISO(d) {
  return d.toISOString();
}

async function main() {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  const threeDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
  const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
  const sixDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

  const orders = [
    {
      customerName: 'Alex',
      created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 9, 0, 0),
      items: [
        { base_item: 'Latte', size: 'Large (16oz)', temp: 'Iced', modifications: { 'Oat Milk': 1 } }
      ]
    },
    {
      customerName: 'Sam',
      created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 12, 15, 0),
      items: [
        { base_item: 'Americano', size: 'Small (12oz)', temp: 'Hot', modifications: {} }
      ]
    },
    {
      customerName: 'Jordan',
      created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 17, 30, 0),
      items: [
        { base_item: 'Plain Croissant', size: 'N/A', temp: 'N/A', modifications: {} },
        { base_item: 'Chocolate Chip Cookie', size: 'N/A', temp: 'N/A', modifications: {} }
      ]
    },
    {
      customerName: 'Casey',
      created_at: new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate(), 10, 0, 0),
      items: [
        { base_item: 'Cold Brew', size: 'Large (16oz)', temp: 'Iced', modifications: {} }
      ]
    },
    {
      customerName: 'Morgan',
      created_at: new Date(threeDaysAgo.getFullYear(), threeDaysAgo.getMonth(), threeDaysAgo.getDate(), 14, 0, 0),
      items: [
        { base_item: 'Matcha Latte', size: 'Small (12oz)', temp: 'Hot', modifications: {} }
      ]
    },
    {
      customerName: 'Riley',
      created_at: new Date(fiveDaysAgo.getFullYear(), fiveDaysAgo.getMonth(), fiveDaysAgo.getDate(), 8, 45, 0),
      items: [
        { base_item: 'Mocha', size: 'Small (12oz)', temp: 'Hot', modifications: { '1 Pump Caramel Syrup': 1 } }
      ]
    },
    {
      customerName: 'Taylor',
      created_at: new Date(fiveDaysAgo.getFullYear(), fiveDaysAgo.getMonth(), fiveDaysAgo.getDate(), 16, 0, 0),
      items: [
        { base_item: 'Black Tea', size: 'Large (16oz)', temp: 'Iced', modifications: {} }
      ]
    },
    {
      customerName: 'Avery',
      created_at: new Date(sixDaysAgo.getFullYear(), sixDaysAgo.getMonth(), sixDaysAgo.getDate(), 11, 30, 0),
      items: [
        { base_item: 'Chocolate Croissant', size: 'N/A', temp: 'N/A', modifications: {} }
      ]
    }
  ];

  const rows = orders.map((o) => {
    const subtotal = o.items.reduce((sum, item) => sum + getItemLineTotal(item), 0);
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const grand_total = Math.round((subtotal + tax) * 100) / 100;
    const created = o.created_at;
    const completed = new Date(created.getTime() + 3 * 60 * 1000);
    return [
      o.customerName,
      'completed',
      toISO(created),
      toISO(completed),
      subtotal,
      tax,
      grand_total,
      JSON.stringify(o.items)
    ];
  });

  const { sheets, sheetId } = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A2:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });

  console.log(`Appended ${rows.length} fake orders to the Orders sheet.`);
  console.log('Owner "yesterday" and "7d" views should now show data.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
