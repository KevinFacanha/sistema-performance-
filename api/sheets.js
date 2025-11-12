import { google } from "googleapis";

function normalizeKey(raw) {
  if (!raw) return raw;
  try {
    const maybe = Buffer.from(raw, "base64").toString("utf8");
    if (maybe.includes("BEGIN PRIVATE KEY")) return maybe;
  } catch {}
  return raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

function pickSpreadsheetId(account, accountsCsv, idsCsv) {
  const accounts = (accountsCsv || "").split(",").map(s => s.trim());
  const ids = (idsCsv || "").split(",").map(s => s.trim());
  const a = String(account || "").trim().toLowerCase();
  const idx = accounts.findIndex(x => x.trim().toLowerCase() === a);
  if (idx >= 0 && ids[idx]) return ids[idx];
  return ids[0] || "";
}

function parseDefaultTabsMap(mapStr) {
  const out = {};
  if (!mapStr) return out;
  for (const pair of mapStr.split(";")) {
    const [k, v] = pair.split("=");
    if (k && v) out[k.trim().toLowerCase()] = v.trim();
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const {
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_BASE64,
      SHEETS_ACCOUNTS,
      SHEETS_IDS,
      DEFAULT_SHEET_TAB,
      SHEETS_DEFAULT_TABS
    } = process.env;

    if (!SHEETS_IDS) {
      return res.status(400).json({ error: "SHEETS_CONFIG_ERROR", message: "Missing SHEETS_IDS (CSV de IDs)" });
    }
    if (!GOOGLE_CLIENT_EMAIL) {
      return res.status(500).json({ error: "SHEETS_CONFIG_ERROR", message: "Missing GOOGLE_CLIENT_EMAIL" });
    }
    const privateKey = normalizeKey(GOOGLE_PRIVATE_KEY_BASE64 || GOOGLE_PRIVATE_KEY);
    if (!privateKey) {
      return res.status(500).json({ error: "SHEETS_CONFIG_ERROR", message: "Missing GOOGLE_PRIVATE_KEY" });
    }

    const account = (req.query?.account || req.body?.account || (SHEETS_ACCOUNTS || "").split(",")[0]).trim();
    const perAccountMap = parseDefaultTabsMap(SHEETS_DEFAULT_TABS);
    const requestedSheet = (req.query?.sheet || req.body?.sheet || "").trim();
    const defaultForAccount = perAccountMap[account.toLowerCase()] || "";
    const globalDefault = (DEFAULT_SHEET_TAB || "").trim();

    const spreadsheetId = (req.query?.id || req.body?.id || pickSpreadsheetId(account, SHEETS_ACCOUNTS, SHEETS_IDS)).trim();

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: GOOGLE_CLIENT_EMAIL, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title)),properties(title)"
    });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean);

    let sheetName = requestedSheet || defaultForAccount || globalDefault;
    if (!sheetName) {
      sheetName = titles[0] || "Página1";
    }

    const match = titles.find(t => t.trim().toLowerCase() === sheetName.trim().toLowerCase());
    if (!match) {
      return res.status(400).json({
        error: "SHEETS_TAB_NOT_FOUND",
        message: `A aba "${sheetName}" não existe nesta planilha.`,
        availableSheets: titles
      });
    }
    sheetName = match;

    const range = `${sheetName}!A1:Z1000`;
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.status(200).json({ account, id: spreadsheetId, sheet: sheetName, rows: data.values || [] });
  } catch (e) {
    const status = e?.response?.status || 500;
    const details = e?.response?.data || e?.message || String(e);
    return res.status(status).json({ error: "SHEETS_ERROR", message: typeof details === "string" ? details : JSON.stringify(details) });
  }
}
