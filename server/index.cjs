require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const path = require("path");

const app = express();
const port = process.env.PORT || 8787;
const distDir = path.resolve(__dirname, "..", "dist");
const indexHtmlPath = path.join(distDir, "index.html");

app.use(cors());
app.use(express.json());

const SHEETS_BY_ACCOUNT = (process.env.GOOGLE_SHEETS_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const HEADER_MAP = {
  "Data": "data",
  "Faturamento Dia (R$)": "faturamento",
  "Quantidade de Vendas": "vendas",
  "Ticket Médio (R$)": "ticketMedio",
  "Nº de Visitas": "visitas",
  "Taxa de Conversão (%)": "taxaConversao",
  "VARIAÇÃO FAT": "variacaoFat",
  "VARIAÇÃO VENDAS": "variacaoVendas",
  "VARIAÇÃO TICKET": "variacaoTicket",
  "VARIAÇÃO VISITAS": "variacaoVisitas",
  "VARIAÇÃO TX DE CONVERSÃO": "variacaoTxConversao",
};
const OPTIONAL_HEADERS = {
  marketplace: "Marketplace",
};

function parseMoneyValue(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const sanitized = String(value)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercentValue(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const sanitized = String(value).replace("%", "").replace(",", ".").trim();
  const parsed = parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumericValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const sanitized = String(value)
    .replace(/[R$%]/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  if (!sanitized) {
    return null;
  }
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBRLNullable(value) {
  const parsed = parseNumericValue(value);
  return parsed === null ? null : parsed;
}

function parseIntNullable(value) {
  const parsed = parseNumericValue(value);
  return parsed === null ? null : Math.round(parsed);
}

function parsePercentNullable(value) {
  const parsed = parseNumericValue(value);
  return parsed === null ? null : parsed;
}

function parseIntValue(value) {
  if (typeof value === "number") return Math.round(value);
  if (!value) return 0;
  const sanitized = String(value).replace(/\./g, "").replace(",", "").trim();
  const parsed = parseInt(sanitized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateToISO(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  if (!str) return null;

  if (str.includes("/")) {
    const [day, month, year] = str.split("/").map((chunk) => parseInt(chunk, 10));
    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year)
    ) {
      const dateObj = new Date(year, month - 1, day);
      if (!Number.isNaN(dateObj.getTime())) {
        return dateObj.toISOString().slice(0, 10);
      }
    }
  }

  const normalized = str.includes("T") ? str : `${str}T00:00:00Z`;
  const fallbackDate = new Date(normalized);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.toISOString().slice(0, 10);
  }

  return null;
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
let authClient = null;
let cachedAuthSignature = null;
const SHEET_CACHE_TTL = 60 * 1000; // 1 minute cache to avoid excessive Google Sheets calls
const tabDataCache = new Map();
const sheetTitleCache = new Map();
const veiaDataCache = new Map();
const curvaABCCache = {
  rows: null,
  expiresAt: 0,
  promise: null,
};

const CURVA_ABC_HEADERS = {
  codigoAnuncio: 'CODIGO ANUNCIO',
  curva: 'CURVA',
  periodo: 'PERIODO',
  marketplace: 'MARKETPLACE',
};
const comparativoFilterCache = new Map();
const VALID_DASHBOARD_ACCOUNTS = new Set(["1", "2"]);

const VEIA_EXPECTED_HEADERS = {
  mesAno: 'Mês/Ano',
  modalidade: 'Modalidade',
  status: 'Status da Venda',
  vendasBrutas1: 'Total de Vendas Brutas (1)',
  vendasBrutas2: 'Total de Vendas Brutas (2)',
  pctC1: '% C1',
  conta1: 'Conta 1',
  pctC2: '% C2',
  conta2: 'Conta 2',
  reembolsoC1: 'Reembolso C1 (R$)',
  reembolsoC2: 'Reembolso C2 (R$)',
  custoDevC1: 'Custo Devolução C1 (R$)',
  custoDevC2: 'Custo Devolução C2 (R$)',
};

function getGoogleSheetsSettings() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !key) {
    throw new Error("Missing required Google Sheets environment variables");
  }

  if (!SHEETS_BY_ACCOUNT.length) {
    throw new Error("GOOGLE_SHEETS_ID is not configured");
  }

  return { clientEmail, key };
}

function getSheetsTabs() {
  const tabsEnv = process.env.SHEETS_TABS || "";
  const sheetsTabs = tabsEnv
    .split(",")
    .map((tab) => tab.trim())
    .filter(Boolean);

  if (!sheetsTabs.length) {
    throw new Error("SHEETS_TABS is not configured");
  }

  return sheetsTabs;
}

function getAccountTabName(contaParam) {
  const tabs = getSheetsTabs();
  const index = Math.max(0, (parseInt(contaParam || '1', 10) || 1) - 1);
  return tabs[Math.min(index, tabs.length - 1)];
}

function getTabNameByIndex(targetIndex = 0) {
  const tabs = getSheetsTabs();
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= tabs.length) {
    throw new Error('Tab index inválido configurado em SHEETS_TABS para Curva ABC');
  }
  return tabs[targetIndex];
}

function getAuth() {
  const { clientEmail, key } = getGoogleSheetsSettings();
  const signature = `${clientEmail}:${key}`;
  if (authClient && cachedAuthSignature === signature) {
    return authClient;
  }

  authClient = new google.auth.JWT({
    email: clientEmail,
    key,
    scopes: [SHEETS_SCOPE],
  });

  cachedAuthSignature = signature;
  return authClient;
}

function sanitizeTabName(s = "") {
  return String(s).replace(/^['"]|['"]$/g, "");
}

function normalizeSheetName(name = "") {
  const sanitized = sanitizeTabName(name ?? "");
  return sanitized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function listSheetTitles(spreadsheetId) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
  return (meta.data.sheets || []).map((s) => {
    const rawTitle = s.properties?.title || "";
    return {
      rawTitle,
      normalized: normalizeSheetName(rawTitle),
    };
  });
}

async function resolveSheetTitle(spreadsheetId, requested) {
  const targetNormalized = normalizeSheetName(requested);
  const cacheKey = `${spreadsheetId}:${targetNormalized}`;
  if (sheetTitleCache.has(cacheKey)) {
    return sheetTitleCache.get(cacheKey);
  }

  const titles = await listSheetTitles(spreadsheetId);
  const hit = titles.find((entry) => entry.normalized === targetNormalized && entry.rawTitle);

  if (hit && hit.rawTitle) {
    sheetTitleCache.set(cacheKey, hit.rawTitle);
    return hit.rawTitle;
  }

  const available = titles.map((entry) => entry.rawTitle).filter(Boolean).join(", ");
  throw new Error(`Aba não encontrada: "${requested}". Abas disponíveis: ${available}`);
}
function quoteSheetTitle(title = "") {
  const escaped = String(title).replace(/'/g, "''");
  return `'${escaped}'`;
}

async function readRange(spreadsheetId, range) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return response.data.values || [];
}

function getHeaderIndex(headerRow, label) {
  return headerRow.findIndex((cell) => (cell || "").trim() === label);
}

function isRowEmpty(row) {
  return row.every((cell) => !String(cell ?? "").trim());
}

function getTabCacheEntry(cacheKey) {
  if (!tabDataCache.has(cacheKey)) {
    tabDataCache.set(cacheKey, {
      rows: null,
      expiresAt: 0,
      promise: null,
    });
  }
  return tabDataCache.get(cacheKey);
}

function getVeiaCacheEntry(cacheKey) {
  if (!veiaDataCache.has(cacheKey)) {
    veiaDataCache.set(cacheKey, {
      rows: null,
      tabName: null,
      headersDetected: null,
      expiresAt: 0,
      promise: null,
    });
  }
  return veiaDataCache.get(cacheKey);
}

function getComparativoFilterCacheEntry(cacheKey) {
  if (!comparativoFilterCache.has(cacheKey)) {
    comparativoFilterCache.set(cacheKey, {
      rows: null,
      expiresAt: 0,
      promise: null,
    });
  }
  return comparativoFilterCache.get(cacheKey);
}

function normalizeVeiaHeader(value = "") {
  return String(value || "")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectVeiaHeaders(headerRow = []) {
  const normalizedRow = headerRow.map((cell) => normalizeVeiaHeader(cell));
  const indices = {};
  const headers = {};

  for (const [field, label] of Object.entries(VEIA_EXPECTED_HEADERS)) {
    const normalizedLabel = normalizeVeiaHeader(label);
    const idx = normalizedRow.findIndex((token) => token === normalizedLabel);
    if (idx === -1) {
      return null;
    }
    indices[field] = idx;
    headers[field] = headerRow[idx] || '';
  }

  return { indices, headers };
}

function parseVeiaMesAno(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  if (!str) return null;

  const mmYYYY = /^([0-9]{2})\/([0-9]{4})$/;
  const yyyyDashMM = /^([0-9]{4})-([0-9]{2})(?:-([0-9]{2}))?$/;
  let year;
  let month;

  if (mmYYYY.test(str)) {
    const [, mm, yyyy] = mmYYYY.exec(str);
    year = Number(yyyy);
    month = Number(mm);
  } else if (yyyyDashMM.test(str)) {
    const [, yyyy, mm] = yyyyDashMM.exec(str);
    year = Number(yyyy);
    month = Number(mm);
  } else {
    const fallback = new Date(str.includes('T') ? str : `${str}T00:00:00Z`);
    if (Number.isNaN(fallback.getTime())) {
      return null;
    }
    year = fallback.getUTCFullYear();
    month = fallback.getUTCMonth() + 1;
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function parseVeiaRow(row = [], indices = {}) {
  const getValue = (field) => {
    const idx = indices[field];
    if (idx === undefined || idx === null) {
      return undefined;
    }
    return row[idx];
  };

  const mesISO = parseVeiaMesAno(getValue('mesAno'));
  if (!mesISO) {
    return null;
  }

  const toNullableString = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  };

  return {
    conta: '3',
    mesAno: mesISO,
    modalidade: toNullableString(getValue('modalidade')),
    status: toNullableString(getValue('status')),
    vendasBrutas1: parseBRLNullable(getValue('vendasBrutas1')),
    vendasBrutas2: parseBRLNullable(getValue('vendasBrutas2')),
    pctC1: parsePercentNullable(getValue('pctC1')),
    conta1: parseIntNullable(getValue('conta1')),
    pctC2: parsePercentNullable(getValue('pctC2')),
    conta2: parseIntNullable(getValue('conta2')),
    reembolsoC1: parseBRLNullable(getValue('reembolsoC1')),
    reembolsoC2: parseBRLNullable(getValue('reembolsoC2')),
    custoDevC1: parseBRLNullable(getValue('custoDevC1')),
    custoDevC2: parseBRLNullable(getValue('custoDevC2')),
  };
}

async function loadTabRows(sheetId, tabName, force = false) {
  const realTitle = await resolveSheetTitle(sheetId, tabName);
  const cacheKey = `${sheetId}:${realTitle}`;
  const now = Date.now();
  const cacheEntry = getTabCacheEntry(cacheKey);

  if (!force && cacheEntry.rows && cacheEntry.expiresAt > now) {
    return cacheEntry.rows;
  }

  if (!force && cacheEntry.promise) {
    return cacheEntry.promise;
  }

  const loader = (async () => {
    const safeTitle = quoteSheetTitle(realTitle);
    const range = `${safeTitle}!A1:Z10000`;
    const sheet = await readRange(sheetId, range);

    if (!sheet || sheet.length < 2) return [];

    const headerRow = sheet[0].map((cell) => cell || "");
    const dataRows = sheet.slice(1);
    const indices = Object.entries(HEADER_MAP).reduce((acc, [label, key]) => {
      acc[key] = getHeaderIndex(headerRow, label);
      return acc;
    }, {});
    const marketplaceIndex = getHeaderIndex(headerRow, OPTIONAL_HEADERS.marketplace);

    const missingRequired = Object.values(indices).some(
      (index) => index === -1 || index === undefined
    );

    if (missingRequired) {
      throw new Error(`Missing required headers in tab "${realTitle}"`);
    }

    const normalizedRows = [];

    for (const row of dataRows) {
      const safeRow = row || [];
      if (isRowEmpty(safeRow)) continue;

      const rawDate = safeRow[indices.data];
      const dateISO = parseDateToISO(rawDate);
      if (!dateISO) continue;

      const faturamentoValue = parseMoneyValue(safeRow[indices.faturamento]);
      const vendasValue = parseIntValue(safeRow[indices.vendas]);
      const ticketValue = parseMoneyValue(safeRow[indices.ticketMedio]);
      const visitasValue = parseIntValue(safeRow[indices.visitas]);
      const taxaValue = parsePercentNullable(safeRow[indices.taxaConversao]);
      const variacaoFatValue = parsePercentNullable(safeRow[indices.variacaoFat]);
      const variacaoVendasValue = parsePercentNullable(safeRow[indices.variacaoVendas]);
      const variacaoTicketValue = parsePercentNullable(safeRow[indices.variacaoTicket]);
      const variacaoVisitasValue = parsePercentNullable(safeRow[indices.variacaoVisitas]);
      const variacaoTxConversaoValue = parsePercentNullable(safeRow[indices.variacaoTxConversao]);

      const normalized = {
        conta: realTitle,
        dateISO,
        faturamento: Number.isFinite(faturamentoValue) ? faturamentoValue : 0,
        vendas: Number.isFinite(vendasValue) ? vendasValue : 0,
        ticketMedio: Number.isFinite(ticketValue) ? ticketValue : 0,
        visitas: Number.isFinite(visitasValue) ? visitasValue : 0,
        taxaConversao: taxaValue ?? 0,
        variacaoFat: variacaoFatValue,
        variacaoVendas: variacaoVendasValue,
        variacaoTicket: variacaoTicketValue,
        variacaoVisitas: variacaoVisitasValue,
        variacaoTxConversao: variacaoTxConversaoValue,
      };

      if (marketplaceIndex !== -1) {
        const marketplaceValue = safeRow[marketplaceIndex];
        if (marketplaceValue) {
          normalized.marketplace = String(marketplaceValue).trim();
        }
      }

      normalizedRows.push(normalized);
    }

    return normalizedRows;
  })();

  if (force) {
    return loader;
  }

  cacheEntry.promise = loader;

  try {
    const rows = await loader;
    cacheEntry.rows = rows;
    cacheEntry.expiresAt = Date.now() + SHEET_CACHE_TTL;
    cacheEntry.promise = null;
    return rows;
  } catch (error) {
    cacheEntry.promise = null;
    cacheEntry.rows = null;
    cacheEntry.expiresAt = 0;
    throw error;
  }
}

async function loadSheetData(sheetId, contaParam = '1', force = false) {
  const tabName = getAccountTabName(contaParam);
  const rows = await loadTabRows(sheetId, tabName, force);
  const sanitizedRows = rows
    .filter((row) => !!row.dateISO)
    .sort((a, b) => {
      if (a.dateISO === b.dateISO) return 0;
      return a.dateISO > b.dateISO ? 1 : -1;
    });
  return sanitizedRows;
}

function normalizeMarketplaceKey(value) {
  if (!value) return "";
  return String(value)
    .split(",")
    .map((chunk) => chunk.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

function buildComparativoCacheKey({ sheetId, tabName, de, ate, marketplace, conta }) {
  return [
    sheetId || "",
    tabName || "",
    de || "",
    ate || "",
    normalizeMarketplaceKey(marketplace),
    String(conta || ""),
  ].join("|");
}

async function getComparativoFilteredRows({ sheetId, contaParam, filters = {} }) {
  const tabName = getAccountTabName(contaParam);
  const cacheKey = buildComparativoCacheKey({
    sheetId,
    tabName,
    de: filters.de || "",
    ate: filters.ate || "",
    marketplace: filters.marketplace || "",
    conta: contaParam,
  });
  const now = Date.now();
  const cacheEntry = getComparativoFilterCacheEntry(cacheKey);

  if (cacheEntry.rows && cacheEntry.expiresAt > now) {
    return { rows: cacheEntry.rows, tabName };
  }

  if (cacheEntry.promise) {
    const rows = await cacheEntry.promise;
    return { rows, tabName };
  }

  const loader = (async () => {
    const rows = await loadSheetData(sheetId, contaParam);
    const filtered = applyFilters(rows, {
      start: filters.de || undefined,
      end: filters.ate || undefined,
      marketplace: filters.marketplace || undefined,
    });
    return filtered;
  })();

  cacheEntry.promise = loader;

  try {
    const rows = await loader;
    cacheEntry.rows = rows;
    cacheEntry.expiresAt = Date.now() + SHEET_CACHE_TTL;
    cacheEntry.promise = null;
    return { rows, tabName };
  } catch (error) {
    cacheEntry.promise = null;
    cacheEntry.rows = null;
    cacheEntry.expiresAt = 0;
    throw error;
  }
}

function pickQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function sanitizeComparativoFilters(query = {}) {
  const rawDe = pickQueryValue(query.de);
  const rawAte = pickQueryValue(query.ate);
  const rawMarketplace = pickQueryValue(query.marketplace);

  const de = typeof rawDe === "string" && rawDe.trim() ? rawDe.trim() : null;
  const ate = typeof rawAte === "string" && rawAte.trim() ? rawAte.trim() : null;
  const marketplace =
    typeof rawMarketplace === "string"
      ? rawMarketplace
          .split(",")
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .join(",")
      : null;

  return { de, ate, marketplace: marketplace || null };
}

function parseComparativoConta(value, paramName) {
  const candidate = pickQueryValue(value);
  const normalized = candidate !== undefined && candidate !== null ? String(candidate).trim() : "";
  if (!VALID_DASHBOARD_ACCOUNTS.has(normalized)) {
    throw createParamError(`Parâmetro "${paramName}" deve ser 1 ou 2`);
  }
  return normalized;
}

function ensureDashboardSheetId(contaParam, label) {
  const sheetId = resolveSheetId(contaParam);
  if (!sheetId) {
    throw createParamError(
      `Conta ${label || contaParam} inválida ou GOOGLE_SHEETS_ID não configurado.`
    );
  }
  return sheetId;
}

async function loadComparativoConta(contaParam, filters, label) {
  const sheetId = ensureDashboardSheetId(contaParam, label);
  const { rows, tabName } = await getComparativoFilteredRows({
    sheetId,
    contaParam,
    filters,
  });
  return {
    id: Number(contaParam),
    contaParam,
    sheetId,
    tabName,
    rows,
  };
}

function buildDashboardResumo(rows = []) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.faturamentoTotal += Number(row?.faturamento || 0);
      acc.vendasTotais += Number(row?.vendas || 0);
      acc.ticketMedioSoma += Number(row?.ticketMedio || 0);
      acc.visitas += Number(row?.visitas || 0);
      acc.taxaConversaoSoma += Number(row?.taxaConversao || 0);
      acc.count += 1;

      const pushIfFinite = (value, sumKey, countKey) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
          return;
        }
        acc[sumKey] += value;
        acc[countKey] += 1;
      };

      pushIfFinite(row?.variacaoFat, "variacaoFatSum", "variacaoFatCount");
      pushIfFinite(row?.variacaoVendas, "variacaoVendasSum", "variacaoVendasCount");
      pushIfFinite(row?.variacaoTicket, "variacaoTicketSum", "variacaoTicketCount");
      pushIfFinite(row?.variacaoVisitas, "variacaoVisitasSum", "variacaoVisitasCount");
      pushIfFinite(
        row?.variacaoTxConversao,
        "variacaoTxConversaoSum",
        "variacaoTxConversaoCount"
      );

      return acc;
    },
    {
      faturamentoTotal: 0,
      vendasTotais: 0,
      ticketMedioSoma: 0,
      visitas: 0,
      taxaConversaoSoma: 0,
      count: 0,
      variacaoFatSum: 0,
      variacaoFatCount: 0,
      variacaoVendasSum: 0,
      variacaoVendasCount: 0,
      variacaoTicketSum: 0,
      variacaoTicketCount: 0,
      variacaoVisitasSum: 0,
      variacaoVisitasCount: 0,
      variacaoTxConversaoSum: 0,
      variacaoTxConversaoCount: 0,
    }
  );

  const avg = (sumKey, countKey) =>
    totals[countKey] > 0 ? roundTwo(totals[sumKey] / totals[countKey]) : null;

  return {
    faturamentoTotal: totals.faturamentoTotal,
    vendasTotais: totals.vendasTotais,
    ticketMedio: totals.count > 0 ? roundTwo(totals.ticketMedioSoma / totals.count) : 0,
    visitas: totals.visitas,
    taxaConversao: totals.count > 0 ? roundTwo(totals.taxaConversaoSoma / totals.count) : 0,
    variacaoFatMedia: avg("variacaoFatSum", "variacaoFatCount"),
    variacaoVendasMedia: avg("variacaoVendasSum", "variacaoVendasCount"),
    variacaoTicketMedia: avg("variacaoTicketSum", "variacaoTicketCount"),
    variacaoVisitasMedia: avg("variacaoVisitasSum", "variacaoVisitasCount"),
    variacaoTxConversaoMedia: avg("variacaoTxConversaoSum", "variacaoTxConversaoCount"),
  };
}

function buildResumoDelta(resumoA = {}, resumoB = {}) {
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const diff = (field) => toNumber(resumoA?.[field]) - toNumber(resumoB?.[field]);
  return {
    faturamentoTotal: roundTwo(diff("faturamentoTotal")),
    vendasTotais: diff("vendasTotais"),
    ticketMedio: roundTwo(diff("ticketMedio")),
    visitas: diff("visitas"),
    taxaConversao: roundTwo(diff("taxaConversao")),
  };
}

function buildMonthlyFatVendas(rows = []) {
  const monthlyMap = new Map();
  for (const row of rows) {
    const rawDate = row?.dateISO;
    if (!rawDate) continue;
    const mesAno = String(rawDate).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mesAno)) continue;
    if (!monthlyMap.has(mesAno)) {
      monthlyMap.set(mesAno, { fat: 0, vendas: 0 });
    }
    const bucket = monthlyMap.get(mesAno);
    bucket.fat += Number(row?.faturamento || 0);
    bucket.vendas += Number(row?.vendas || 0);
  }
  return monthlyMap;
}

async function loadVeiaSheetData(sheetId, force = false) {
  const cacheKey = `${sheetId}:veia`;
  const cacheEntry = getVeiaCacheEntry(cacheKey);
  const now = Date.now();

  if (!force && cacheEntry.rows && cacheEntry.expiresAt > now) {
    return {
      rows: cacheEntry.rows,
      tabName: cacheEntry.tabName,
      headersDetected: cacheEntry.headersDetected,
    };
  }

  if (!force && cacheEntry.promise) {
    return cacheEntry.promise;
  }

  const loader = (async () => {
    let requestedTab;
    try {
      requestedTab = getAccountTabName('3') || 'Consolidado';
    } catch {
      requestedTab = 'Consolidado';
    }
    const realTitle = await resolveSheetTitle(sheetId, requestedTab);
    if (!realTitle) {
      const error = new Error('Aba "Consolidado" não encontrada para a conta 3.');
      error.statusCode = 400;
      throw error;
    }

    const safeTitle = quoteSheetTitle(realTitle);
    const range = `${safeTitle}!A1:Z10000`;
    const sheet = await readRange(sheetId, range);
    if (!sheet || sheet.length < 2) {
      const error = new Error('Aba "Consolidado" vazia ou sem dados.');
      error.statusCode = 400;
      throw error;
    }

    const headerRow = sheet[0].map((cell) => cell || '');
    const detection = detectVeiaHeaders(headerRow);
    if (!detection) {
      const error = new Error('Cabeçalhos VEIA não encontrados na aba "Consolidado".');
      error.statusCode = 400;
      throw error;
    }

    const { indices, headers } = detection;
    const dataRows = sheet.slice(1);
    const normalizedRows = [];
    for (const row of dataRows) {
      const safeRow = row || [];
      if (isRowEmpty(safeRow)) continue;
      const parsed = parseVeiaRow(safeRow, indices);
      if (!parsed) continue;
      normalizedRows.push(parsed);
    }

    if (!normalizedRows.length) {
      const error = new Error('Nenhuma linha válida encontrada na aba "Consolidado".');
      error.statusCode = 400;
      throw error;
    }

    normalizedRows.sort((a, b) => {
      if (a.mesAno === b.mesAno) return 0;
      return a.mesAno > b.mesAno ? 1 : -1;
    });

    return { rows: normalizedRows, tabName: realTitle, headersDetected: headers };
  })();

  if (force) {
    return loader;
  }

  cacheEntry.promise = loader;

  try {
    const result = await loader;
    cacheEntry.rows = result.rows;
    cacheEntry.tabName = result.tabName;
    cacheEntry.headersDetected = result.headersDetected;
    cacheEntry.expiresAt = Date.now() + SHEET_CACHE_TTL;
    cacheEntry.promise = null;
    return result;
  } catch (error) {
    cacheEntry.promise = null;
    cacheEntry.rows = null;
    cacheEntry.tabName = null;
    cacheEntry.headersDetected = null;
    cacheEntry.expiresAt = 0;
    throw error;
  }
}

function normalizeVeiaMonthFilter(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}$/.test(str)) return str;
  if (/^\d{2}\/\d{4}$/.test(str)) {
    const [mm, yyyy] = str.split('/');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str.slice(0, 7);
  }
  return null;
}

function normalizeVeiaText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '*') return null;
  return trimmed.toLowerCase();
}

function sanitizeVeiaFilters(query = {}) {
  const rawDe = typeof query.de === 'string' ? query.de.trim() : query.de;
  const rawAte = typeof query.ate === 'string' ? query.ate.trim() : query.ate;

  const de = rawDe ? normalizeVeiaMonthFilter(rawDe) : null;
  if (rawDe && !de) {
    throw createParamError('Parâmetro "de" inválido (use YYYY-MM ou MM/YYYY)');
  }

  const ate = rawAte ? normalizeVeiaMonthFilter(rawAte) : null;
  if (rawAte && !ate) {
    throw createParamError('Parâmetro "ate" inválido (use YYYY-MM ou MM/YYYY)');
  }

  return {
    de,
    ate,
    modalidade: normalizeVeiaText(query.modalidade),
    status: normalizeVeiaText(query.status),
  };
}

function filterVeiaRows(rows = [], filters = {}) {
  const { de, ate, modalidade, status } = filters || {};
  return rows.filter((row) => {
    const monthKey = row.mesAno || null;
    if (de && (!monthKey || monthKey < de)) {
      return false;
    }
    if (ate && (!monthKey || monthKey > ate)) {
      return false;
    }

    if (modalidade) {
      const rowModalidade = normalizeVeiaText(row.modalidade);
      if (rowModalidade !== modalidade) {
        return false;
      }
    }

    if (status) {
      const rowStatus = normalizeVeiaText(row.status);
      if (rowStatus !== status) {
        return false;
      }
    }

    return true;
  });
}

function buildVeiaSummary(rows = []) {
  const monthSet = new Set();
  const totals = {
    vendasBrutas1Total: 0,
    vendasBrutas2Total: 0,
    conta1Total: 0,
    conta2Total: 0,
    reembolsoC1Total: 0,
    reembolsoC2Total: 0,
    custoDevC1Total: 0,
    custoDevC2Total: 0,
  };

  rows.forEach((row) => {
    if (row.mesAno) {
      monthSet.add(row.mesAno);
    }
    totals.vendasBrutas1Total += row.vendasBrutas1 ?? 0;
    totals.vendasBrutas2Total += row.vendasBrutas2 ?? 0;
    totals.conta1Total += row.conta1 ?? 0;
    totals.conta2Total += row.conta2 ?? 0;
    totals.reembolsoC1Total += row.reembolsoC1 ?? 0;
    totals.reembolsoC2Total += row.reembolsoC2 ?? 0;
    totals.custoDevC1Total += row.custoDevC1 ?? 0;
    totals.custoDevC2Total += row.custoDevC2 ?? 0;
  });

  return {
    meses: monthSet.size,
    vendasBrutas1Total: roundTwo(totals.vendasBrutas1Total),
    vendasBrutas2Total: roundTwo(totals.vendasBrutas2Total),
    conta1Total: roundTwo(totals.conta1Total),
    conta2Total: roundTwo(totals.conta2Total),
    reembolsoC1Total: roundTwo(totals.reembolsoC1Total),
    reembolsoC2Total: roundTwo(totals.reembolsoC2Total),
    custoDevC1Total: roundTwo(totals.custoDevC1Total),
    custoDevC2Total: roundTwo(totals.custoDevC2Total),
  };
}

function buildVeiaMonthly(rows = []) {
  const monthlyMap = new Map();
  const modalidades = new Set();
  const statusSet = new Set();

  rows.forEach((row) => {
    if (row.modalidade) {
      modalidades.add(String(row.modalidade));
    }
    if (row.status) {
      statusSet.add(String(row.status));
    }

    if (!row.mesAno) return;
    if (!monthlyMap.has(row.mesAno)) {
      monthlyMap.set(row.mesAno, {
        mesAno: row.mesAno,
        vendasBrutas1: 0,
        vendasBrutas2: 0,
        conta1: 0,
        conta2: 0,
        reembolsoC1: 0,
        reembolsoC2: 0,
        custoDevC1: 0,
        custoDevC2: 0,
      });
    }
    const bucket = monthlyMap.get(row.mesAno);
    bucket.vendasBrutas1 += row.vendasBrutas1 ?? 0;
    bucket.vendasBrutas2 += row.vendasBrutas2 ?? 0;
    bucket.conta1 += row.conta1 ?? 0;
    bucket.conta2 += row.conta2 ?? 0;
    bucket.reembolsoC1 += row.reembolsoC1 ?? 0;
    bucket.reembolsoC2 += row.reembolsoC2 ?? 0;
    bucket.custoDevC1 += row.custoDevC1 ?? 0;
    bucket.custoDevC2 += row.custoDevC2 ?? 0;
  });

  const meses = Array.from(monthlyMap.values())
    .sort((a, b) => a.mesAno.localeCompare(b.mesAno))
    .map((item) => ({
      mesAno: item.mesAno,
      vendasBrutas1: roundTwo(item.vendasBrutas1),
      vendasBrutas2: roundTwo(item.vendasBrutas2),
      conta1: roundTwo(item.conta1),
      conta2: roundTwo(item.conta2),
      reembolsoC1: roundTwo(item.reembolsoC1),
      reembolsoC2: roundTwo(item.reembolsoC2),
      custoDevC1: roundTwo(item.custoDevC1),
      custoDevC2: roundTwo(item.custoDevC2),
    }));

  const modalidadesLista = Array.from(modalidades).sort((a, b) => a.localeCompare(b));
  const statusLista = Array.from(statusSet).sort((a, b) => a.localeCompare(b));

  return { meses, modalidades: modalidadesLista, status: statusLista };
}

function createParamError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function resolveSheetId(contaParam) {
  const raw = Array.isArray(contaParam) ? contaParam[0] : contaParam;
  const index = Math.max(0, (parseInt(raw || '1', 10) || 1) - 1);
  return SHEETS_BY_ACCOUNT[index];
}

function sanitizeFilterQuery(query = {}) {
  if (!query) return {};
  const { conta, ...rest } = query;
  return rest;
}

function isVeiaAccount(contaParam) {
  return String(contaParam || '').trim() === '3';
}

function getContaParam(req) {
  if (!req || !req.query) return '1';
  const raw = req.query.conta;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value) : '1';
}

function parseDateParam(v) {
  if (!v) return null;
  const str = String(v).trim();
  if (!str) return null;
  const isDMY = /^\d{2}\/\d{2}\/\d{4}$/.test(str);
  let date;
  if (isDMY) {
    const [dd, mm, yyyy] = str.split("/");
    date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  } else {
    date = new Date(`${str}T00:00:00Z`);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseListParam(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

function applyFilters(rows, { start, end, conta, marketplace } = {}) {
  let out = rows;

  if (start) {
    const ds = parseDateParam(start);
    if (!ds) {
      throw createParamError(
        'Parâmetro "start" inválido (use YYYY-MM-DD ou dd/mm/aaaa)'
      );
    }
    out = out.filter((r) => {
      const rowDate = new Date(`${r.dateISO}T00:00:00Z`);
      return !Number.isNaN(rowDate.getTime()) && rowDate >= ds;
    });
  }

  if (end) {
    const de = parseDateParam(end);
    if (!de) {
      throw createParamError(
        'Parâmetro "end" inválido (use YYYY-MM-DD ou dd/mm/aaaa)'
      );
    }
    const deIncl = new Date(de);
    deIncl.setUTCDate(deIncl.getUTCDate() + 1);
    out = out.filter((r) => {
      const rowDate = new Date(`${r.dateISO}T00:00:00Z`);
      return !Number.isNaN(rowDate.getTime()) && rowDate < deIncl;
    });
  }

  const contas = parseListParam(conta);
  if (contas.length) {
    out = out.filter((r) =>
      contas.includes(String(r.conta || "").toLowerCase())
    );
  }

  const markets = parseListParam(marketplace);
  if (markets.length) {
    out = out.filter((r) =>
      markets.includes(String(r.marketplace || "").toLowerCase())
    );
  }

  return out;
}

function roundTwo(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getCurvaABCSettings() {
  const sheetId = SHEETS_BY_ACCOUNT[3];
  if (!sheetId) {
    throw new Error('Planilha Curva ABC não configurada. Adicione a quarta entrada em GOOGLE_SHEETS_ID.');
  }
  const tabName = getTabNameByIndex(3);
  return { sheetId, tabName };
}

function normalizeCurvaPeriodo(value) {
  if (!value) return null;
  const iso = parseDateToISO(value);
  if (iso) return iso;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(str)) {
    return `${str}-01`;
  }
  if (/^\d{2}\/\d{4}$/.test(str)) {
    const [mm, yyyy] = str.split('/');
    return `${yyyy}-${mm.padStart(2, '0')}-01`;
  }
  const fallback = new Date(str.includes('T') ? str : `${str}T00:00:00Z`);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return null;
}

async function getCurvaABCData(force = false) {
  const now = Date.now();
  if (!force && curvaABCCache.rows && curvaABCCache.expiresAt > now) {
    return curvaABCCache.rows;
  }
  if (!force && curvaABCCache.promise) {
    return curvaABCCache.promise;
  }

  const loader = (async () => {
    const { sheetId, tabName } = getCurvaABCSettings();
    const realTitle = await resolveSheetTitle(sheetId, tabName);
    const safeTitle = quoteSheetTitle(realTitle);
    const range = `${safeTitle}!A1:Z10000`;
    const sheet = await readRange(sheetId, range);
    if (!sheet || sheet.length < 2) {
      return [];
    }

    const headerRow = sheet[0].map((cell) => (cell || '').toString().trim());
    const indices = Object.entries(CURVA_ABC_HEADERS).reduce((acc, [key, label]) => {
      acc[key] = getHeaderIndex(headerRow, label);
      return acc;
    }, {});
    const missingRequired = Object.values(indices).some((value) => value === -1 || value === undefined);
    if (missingRequired) {
      throw new Error('Planilha Curva ABC não possui todos os cabeçalhos obrigatórios.');
    }

    const dataRows = sheet.slice(1);
    const rows = [];
    for (const row of dataRows) {
      const safeRow = row || [];
      if (isRowEmpty(safeRow)) continue;
      const codigoAnuncio = String(safeRow[indices.codigoAnuncio] || '').trim();
      const curva = String(safeRow[indices.curva] || '').trim();
      const periodoRaw = safeRow[indices.periodo];
      const periodoISO = normalizeCurvaPeriodo(periodoRaw);
      const marketplaceValue = safeRow[indices.marketplace];
      rows.push({
        codigoAnuncio,
        curva,
        periodo: periodoISO,
        marketplace: marketplaceValue ? String(marketplaceValue).trim() : null,
      });
    }
    return rows;
  })();

  if (force) {
    return loader;
  }

  curvaABCCache.promise = loader;
  try {
    const rows = await loader;
    curvaABCCache.rows = rows;
    curvaABCCache.expiresAt = Date.now() + SHEET_CACHE_TTL;
    curvaABCCache.promise = null;
    return rows;
  } catch (error) {
    curvaABCCache.promise = null;
    curvaABCCache.rows = null;
    curvaABCCache.expiresAt = 0;
    throw error;
  }
}

function buildCurvaABCMudancas(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const grouped = rows.reduce((acc, row) => {
    const codigo = row?.codigoAnuncio || 'desconhecido';
    if (!acc.has(codigo)) {
      acc.set(codigo, []);
    }
    acc.get(codigo).push(row);
    return acc;
  }, new Map());

  const mudancas = [];

  grouped.forEach((list, codigo) => {
    const ordered = list
      .map((item) => ({
        ...item,
        periodo: item?.periodo || null,
      }))
      .sort((a, b) => {
        const aTime = a.periodo ? Date.parse(`${a.periodo}T00:00:00Z`) : NaN;
        const bTime = b.periodo ? Date.parse(`${b.periodo}T00:00:00Z`) : NaN;
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return aTime - bTime;
      });

    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const current = ordered[i];
      if (!prev.curva || !current.curva) {
        continue;
      }
      if (prev.curva.trim() === current.curva.trim()) {
        continue;
      }
      mudancas.push({
        codigo,
        anterior: prev.curva,
        atual: current.curva,
        periodo_anterior: prev.periodo,
        periodo_atual: current.periodo,
        marketplace: current.marketplace || prev.marketplace || null,
      });
    }
  });

  return mudancas;
}

function logRoutes(appInstance) {
  console.log("[ROUTES]");
  if (!appInstance) return;

  const router = appInstance.router || appInstance._router;
  const stack = router && router.stack;
  if (!stack) return;

  stack.forEach((layer) => {
    if (!layer.route) return;
    const routePath = layer.route.path;
    const methods = Object.keys(layer.route.methods || {});
    if (!routePath || !methods.length) return;
    methods.forEach((method) => {
      console.log(`${method.toUpperCase()} ${routePath}`);
    });
  });
}

app.get("/_health", (req, res) => res.json({ ok: true }));

app.get("/api/debug/sheets", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    let tabConfigurada = null;
    try {
      tabConfigurada = getAccountTabName(contaParam);
    } catch {
      tabConfigurada = null;
    }
    const titles = await listSheetTitles(sheetId);
    return res.json({ ok: true, conta: contaParam, sheetId, titles, tabConfigurada });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: e.message,
      code: e.code,
    });
  }
});

app.get("/api/debug/firstrow", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    if (isVeiaAccount(contaParam)) {
      const { rows, headersDetected } = await loadVeiaSheetData(sheetId);
      return res.json({
        ok: true,
        conta: contaParam,
        sheetId,
        headersDetectados: headersDetected,
        row: rows[0] || null,
      });
    }

    const rows = await loadSheetData(sheetId, contaParam);
    res.json({ ok: true, conta: contaParam, sheetId, first: rows[0] || null });
  } catch (error) {
    console.error("Error fetching first row:", error);
    const status = error.statusCode || 500;
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/debug/sample", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    if (isVeiaAccount(contaParam)) {
      const { rows } = await loadVeiaSheetData(sheetId);
      return res.json({ ok: true, conta: contaParam, sheetId, rows: rows.slice(0, 3) });
    }

    const rows = await loadSheetData(sheetId, contaParam);
    return res.json({ ok: true, conta: contaParam, sheetId, rows: rows.slice(0, 3) });
  } catch (error) {
    console.error("Error fetching sample rows:", error);
    const status = error.statusCode || 500;
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/dashboard/summary", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    if (isVeiaAccount(contaParam)) {
      return res.status(400).json({
        ok: false,
        conta: contaParam,
        sheetId,
        error: 'Use /api/veia/* para conta 3',
      });
    }

    const rows = await loadSheetData(sheetId, contaParam);
    const filters = sanitizeFilterQuery(req.query || {});
    const filtered = applyFilters(rows, filters);

    const totals = filtered.reduce(
      (acc, row) => {
        acc.faturamentoTotal += row.faturamento || 0;
        acc.vendasTotais += row.vendas || 0;
        acc.ticketMedioSoma += row.ticketMedio || 0;
        acc.visitas += row.visitas || 0;
        acc.taxaConversaoSoma += row.taxaConversao || 0;
        acc.count += 1;

        const collect = (value, key) => {
          if (value === null || value === undefined || Number.isNaN(value)) {
            return;
          }
          acc[`${key}Sum`] += value;
          acc[`${key}Count`] += 1;
        };

        collect(row.variacaoFat, "variacaoFat");
        collect(row.variacaoVendas, "variacaoVendas");
        collect(row.variacaoTicket, "variacaoTicket");
        collect(row.variacaoVisitas, "variacaoVisitas");
        collect(row.variacaoTxConversao, "variacaoTxConversao");

        return acc;
      },
      {
        faturamentoTotal: 0,
        vendasTotais: 0,
        ticketMedioSoma: 0,
        visitas: 0,
        taxaConversaoSoma: 0,
        count: 0,
        variacaoFatSum: 0,
        variacaoFatCount: 0,
        variacaoVendasSum: 0,
        variacaoVendasCount: 0,
        variacaoTicketSum: 0,
        variacaoTicketCount: 0,
        variacaoVisitasSum: 0,
        variacaoVisitasCount: 0,
        variacaoTxConversaoSum: 0,
        variacaoTxConversaoCount: 0,
      }
    );

    const avg = (sumKey, countKey) =>
      totals[countKey] > 0 ? roundTwo(totals[sumKey] / totals[countKey]) : null;

    const resumo = {
      faturamentoTotal: totals.faturamentoTotal,
      vendasTotais: totals.vendasTotais,
      ticketMedio:
        totals.count > 0 ? roundTwo(totals.ticketMedioSoma / totals.count) : 0,
      visitas: totals.visitas,
      taxaConversao:
        totals.count > 0 ? roundTwo(totals.taxaConversaoSoma / totals.count) : 0,
      variacaoFatMedia: avg("variacaoFatSum", "variacaoFatCount"),
      variacaoVendasMedia: avg("variacaoVendasSum", "variacaoVendasCount"),
      variacaoTicketMedia: avg("variacaoTicketSum", "variacaoTicketCount"),
      variacaoVisitasMedia: avg("variacaoVisitasSum", "variacaoVisitasCount"),
      variacaoTxConversaoMedia: avg(
        "variacaoTxConversaoSum",
        "variacaoTxConversaoCount"
      ),
    };

    res.json({ ok: true, conta: contaParam, sheetId, resumo });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("Error building dashboard summary:", error);
    }
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/dashboard/detalhado", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    if (isVeiaAccount(contaParam)) {
      return res.status(400).json({
        ok: false,
        conta: contaParam,
        sheetId,
        error: 'Use /api/veia/* para conta 3',
      });
    }

    const rows = await loadSheetData(sheetId, contaParam);
    const filters = sanitizeFilterQuery(req.query || {});
    const filtered = applyFilters(rows, filters);

    const hasPagination =
      typeof req.query.page !== "undefined" ||
      typeof req.query.limit !== "undefined";

    if (!hasPagination) {
      return res.json({ ok: true, conta: contaParam, sheetId, linhas: filtered });
    }

    const pageRaw = req.query.page ?? "1";
    const limitRaw = req.query.limit ?? "200";

    const page = Number.parseInt(pageRaw, 10);
    if (!Number.isInteger(page) || page < 1) {
      throw createParamError(
        'Parâmetro "page" inválido (use inteiro >= 1)'
      );
    }

    const limit = Number.parseInt(limitRaw, 10);
    if (!Number.isInteger(limit) || limit < 1) {
      throw createParamError(
        'Parâmetro "limit" inválido (use inteiro >= 1)'
      );
    }
    if (limit > 2000) {
      throw createParamError('Parâmetro "limit" deve ser no máximo 2000');
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const linhas = filtered.slice(startIndex, startIndex + limit);

    res.json({ ok: true, conta: contaParam, sheetId, linhas, page, limit, total });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("Error building dashboard detail:", error);
    }
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/dashboard/monthly", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    if (isVeiaAccount(contaParam)) {
      return res.status(400).json({
        ok: false,
        conta: contaParam,
        sheetId,
        error: 'Use /api/veia/* para conta 3',
      });
    }

    const rows = await loadSheetData(sheetId, contaParam);
    const filters = sanitizeFilterQuery(req.query || {});
    const filtered = applyFilters(rows, filters);

    const monthlyMap = new Map();
    for (const row of filtered) {
      const rawDate = row?.dateISO;
      if (!rawDate) continue;
      const mesISO = String(rawDate).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mesISO)) continue;

      if (!monthlyMap.has(mesISO)) {
        monthlyMap.set(mesISO, { mesISO, faturamento: 0, vendas: 0 });
      }
      const agg = monthlyMap.get(mesISO);
      agg.faturamento += Number(row?.faturamento || 0);
      agg.vendas += Number(row?.vendas || 0);
    }

    const meses = Array.from(monthlyMap.values())
      .sort((a, b) => a.mesISO.localeCompare(b.mesISO))
      .map((entry) => ({
        mesISO: entry.mesISO,
        faturamento: roundTwo(entry.faturamento),
        vendas: Math.round(entry.vendas),
      }));

    res.json({ ok: true, conta: contaParam, sheetId, meses });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("Error building monthly dashboard:", error);
    }
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/comparativo/summary", async (req, res) => {
  try {
    const contaAParam = parseComparativoConta(req.query?.contaA, "contaA");
    const contaBParam = parseComparativoConta(req.query?.contaB, "contaB");
    const filters = sanitizeComparativoFilters(req.query || {});

    const [contaAData, contaBData] = await Promise.all([
      loadComparativoConta(contaAParam, filters, "A"),
      loadComparativoConta(contaBParam, filters, "B"),
    ]);

    const resumoA = buildDashboardResumo(contaAData.rows);
    const resumoB = buildDashboardResumo(contaBData.rows);
    const delta = buildResumoDelta(resumoA, resumoB);

    res.json({
      ok: true,
      contaA: { id: contaAData.id, sheetId: contaAData.sheetId, resumo: resumoA },
      contaB: { id: contaBData.id, sheetId: contaBData.sheetId, resumo: resumoB },
      delta,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("Error building comparative summary:", error);
    }
    res.status(status).json({
      ok: false,
      contaA: req.query?.contaA,
      contaB: req.query?.contaB,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/comparativo/mensal", async (req, res) => {
  try {
    const contaAParam = parseComparativoConta(req.query?.contaA, "contaA");
    const contaBParam = parseComparativoConta(req.query?.contaB, "contaB");
    const filters = sanitizeComparativoFilters(req.query || {});

    const [contaAData, contaBData] = await Promise.all([
      loadComparativoConta(contaAParam, filters, "A"),
      loadComparativoConta(contaBParam, filters, "B"),
    ]);

    const monthlyA = buildMonthlyFatVendas(contaAData.rows);
    const monthlyB = buildMonthlyFatVendas(contaBData.rows);

    const monthKeys = Array.from(new Set([...monthlyA.keys(), ...monthlyB.keys()])).sort((a, b) =>
      a.localeCompare(b)
    );

    const meses = monthKeys.map((mesAno) => {
      const bucketA = monthlyA.get(mesAno) || { fat: 0, vendas: 0 };
      const bucketB = monthlyB.get(mesAno) || { fat: 0, vendas: 0 };
      return {
        mesAno,
        A: { fat: roundTwo(bucketA.fat), vendas: Math.round(bucketA.vendas) },
        B: { fat: roundTwo(bucketB.fat), vendas: Math.round(bucketB.vendas) },
      };
    });

    res.json({ ok: true, meses });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("Error building comparative monthly data:", error);
    }
    res.status(status).json({
      ok: false,
      contaA: req.query?.contaA,
      contaB: req.query?.contaB,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

app.get("/api/curvaabc", async (req, res) => {
  try {
    const rows = await getCurvaABCData();
    res.json({ ok: true, rows });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Error loading Curva ABC data:', error);
    }
    res.status(status).json({
      ok: false,
      error: error.message || 'Internal server error',
      code: error.code,
    });
  }
});

app.get("/api/curvaabc/check", async (req, res) => {
  try {
    const rows = await getCurvaABCData();
    const mudancas = buildCurvaABCMudancas(rows);
    res.json({ ok: true, mudancas });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Error checking Curva ABC changes:', error);
    }
    res.status(status).json({
      ok: false,
      error: error.message || 'Internal server error',
      code: error.code,
    });
  }
});

app.get("/api/veia/summary", async (req, res) => {
  const contaParam = getContaParam(req);
  if (!isVeiaAccount(contaParam)) {
    return res.status(400).json({
      ok: false,
      conta: contaParam,
      error: 'Rota VEIA só para conta 3',
    });
  }

  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    const { rows } = await loadVeiaSheetData(sheetId);
    const filters = sanitizeVeiaFilters(req.query || {});
    const filtered = filterVeiaRows(rows, filters);
    const resumo = buildVeiaSummary(filtered);
    res.json({ ok: true, conta: contaParam, sheetId, resumo });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Error building VEIA summary:', error);
    }
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || 'Internal server error',
      code: error.code,
    });
  }
});

app.get("/api/veia/mensal", async (req, res) => {
  const contaParam = getContaParam(req);
  if (!isVeiaAccount(contaParam)) {
    return res.status(400).json({
      ok: false,
      conta: contaParam,
      error: 'Rota VEIA só para conta 3',
    });
  }

  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    const { rows } = await loadVeiaSheetData(sheetId);
    const filters = sanitizeVeiaFilters(req.query || {});
    const filtered = filterVeiaRows(rows, filters);
    const { meses, modalidades, status: statusLista } = buildVeiaMonthly(filtered);
    res.json({ ok: true, conta: contaParam, sheetId, meses, modalidades, status: statusLista });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Error building VEIA monthly data:', error);
    }
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || 'Internal server error',
      code: error.code,
    });
  }
});

app.get("/api/sync", async (req, res) => {
  const contaParam = getContaParam(req);
  const sheetId = resolveSheetId(req?.query?.conta);
  if (!sheetId) {
    return res
      .status(400)
      .json({
        ok: false,
        conta: contaParam,
        error: 'Conta inválida ou GOOGLE_SHEETS_ID não configurado.',
      });
  }

  try {
    const rows = await loadSheetData(sheetId, contaParam);
    res.json({ ok: true, conta: contaParam, sheetId, rows });
  } catch (error) {
    console.error("Error fetching sheets:", error);
    const status = error.statusCode || 500;
    res.status(status).json({
      ok: false,
      conta: contaParam,
      sheetId,
      error: error.message || "Internal server error",
      code: error.code,
    });
  }
});

// Serve Vite build assets
app.use(express.static(distDir));

// SPA fallback for non-API routes
app.get("*", (req, res, next) => {
  const requestPath = req.path || "";
  const isApiRoute = requestPath.startsWith("/api");
  const isHealthRoute = requestPath === "/_health";
  if (isApiRoute || isHealthRoute || req.method !== "GET") {
    return next();
  }

  return res.sendFile(indexHtmlPath, (err) => {
    if (err) {
      next(err);
    }
  });
});

// log registered routes
logRoutes(app);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

module.exports = app;
