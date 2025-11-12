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

export default async function handler(req, res) {
  try {
    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_PRIVATE_KEY_BASE64, SHEETS_ACCOUNTS, SHEETS_IDS } = process.env;
    const privateKey = normalizeKey(GOOGLE_PRIVATE_KEY_BASE64 || GOOGLE_PRIVATE_KEY);
    const account = (req.query?.account || "").trim();
    const spreadsheetId = (req.query?.id || "").trim() || pickSpreadsheetId(account, SHEETS_ACCOUNTS, SHEETS_IDS);

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: GOOGLE_CLIENT_EMAIL, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const { data } = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties(title),sheets(properties(title))"
    });

    const titles = (data.sheets || []).map(s => s.properties?.title).filter(Boolean);
    return res.status(200).json({ account, id: spreadsheetId, fileTitle: data.properties?.title, sheetTitles: titles });
  } catch (e) {
    const status = e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: e?.response?.data || e?.message || String(e) });
  }
}
