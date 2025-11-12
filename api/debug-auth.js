import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return res.status(500).json({ ok: false, error: "MISSING_ENVS" });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: (GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    return res.status(200).json({
      ok: true,
      hasToken: Boolean(token?.token),
      clientEmail: GOOGLE_CLIENT_EMAIL
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
