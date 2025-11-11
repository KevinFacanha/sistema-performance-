import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SHEETS_ID = "11ZDglb9R-dTX09zk_XaVMAQRhyys5ZcC_6jkuv800Xk";
const SHEET_NAME = "Sheet1";
const GOOGLE_SHEETS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${SHEET_NAME}`;

interface SalesRow {
  data: string;
  faturamentoDia: number;
  variacaoFat?: number;
  quantidadeVendas: number;
  variacaoVendas?: number;
  ticketMedio: number;
  variacaoTicket?: number;
  numeroVisitas: number;
  variacaoVisitas?: number;
  taxaConversao: number;
  variacaoConversao?: number;
  marketplace: string;
}

function parseMoneyValue(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const str = String(value);
  return (
    parseFloat(
      str
        .replace("R$", "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim()
    ) || 0
  );
}

function parsePercentValue(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const str = String(value);
  return parseFloat(str.replace("%", "").replace(",", ".").trim()) || 0;
}

function parseIntValue(value: any): number {
  if (typeof value === "number") return Math.floor(value);
  if (!value) return 0;
  return parseInt(String(value).replace(/\./g, "").replace(",", "")) || 0;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  const str = String(value).trim();

  let dateObj: Date | null = null;

  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        dateObj = new Date(year, month - 1, day);
      }
    }
  } else {
    dateObj = new Date(value);
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return null;
  }

  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeHeaderName(header: string): string {
  return String(header || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findHeaderIndex(headers: string[], targetHeader: string): number {
  const normalized = normalizeHeaderName(targetHeader);
  return headers.findIndex((h) => normalizeHeaderName(h) === normalized);
}

async function fetchAndParseSheets(): Promise<SalesRow[]> {
  const apiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  
  if (!apiKey) {
    throw new Error("GOOGLE_SHEETS_API_KEY environment variable not set");
  }

  const url = `${GOOGLE_SHEETS_API_URL}?key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Sheets: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const rawData: any[] = data.values || [];

  if (rawData.length < 2) {
    console.warn("Sheets data is empty or has no data rows");
    return [];
  }

  const EXPECTED_HEADERS = [
    "Data",
    "Faturamento Dia (R$)",
    "VARIAÇÃO FAT",
    "Quantidade de Vendas",
    "VARIAÇÃO VENDAS",
    "Ticket Médio (R$)",
    "VARIAÇÃO TICKET",
    "Nº de Visitas",
    "VARIAÇÃO VISITAS",
    "Taxa de Conversão (%)",
    "VARIAÇÃO TX DE CONVERSÃO",
    "Marketplace",
  ];

  const headerRow = rawData[0];
  const dataRows = rawData.slice(1);

  const headerIndices = {
    data: findHeaderIndex(headerRow, EXPECTED_HEADERS[0]),
    faturamentoDia: findHeaderIndex(headerRow, EXPECTED_HEADERS[1]),
    variacaoFat: findHeaderIndex(headerRow, EXPECTED_HEADERS[2]),
    quantidadeVendas: findHeaderIndex(headerRow, EXPECTED_HEADERS[3]),
    variacaoVendas: findHeaderIndex(headerRow, EXPECTED_HEADERS[4]),
    ticketMedio: findHeaderIndex(headerRow, EXPECTED_HEADERS[5]),
    variacaoTicket: findHeaderIndex(headerRow, EXPECTED_HEADERS[6]),
    numeroVisitas: findHeaderIndex(headerRow, EXPECTED_HEADERS[7]),
    variacaoVisitas: findHeaderIndex(headerRow, EXPECTED_HEADERS[8]),
    taxaConversao: findHeaderIndex(headerRow, EXPECTED_HEADERS[9]),
    variacaoConversao: findHeaderIndex(headerRow, EXPECTED_HEADERS[10]),
    marketplace: findHeaderIndex(headerRow, EXPECTED_HEADERS[11]),
  };

  const salesData: SalesRow[] = dataRows
    .map((row: any[]): SalesRow | null => {
      const formattedDate = parseDate(row[headerIndices.data]);
      if (!formattedDate) return null;

      return {
        data: formattedDate,
        faturamentoDia: parseMoneyValue(row[headerIndices.faturamentoDia]),
        variacaoFat: parsePercentValue(row[headerIndices.variacaoFat]),
        quantidadeVendas: parseIntValue(row[headerIndices.quantidadeVendas]),
        variacaoVendas: parsePercentValue(row[headerIndices.variacaoVendas]),
        ticketMedio: parseMoneyValue(row[headerIndices.ticketMedio]),
        variacaoTicket: parsePercentValue(row[headerIndices.variacaoTicket]),
        numeroVisitas: parseIntValue(row[headerIndices.numeroVisitas]),
        variacaoVisitas: parsePercentValue(row[headerIndices.variacaoVisitas]),
        taxaConversao: parsePercentValue(row[headerIndices.taxaConversao]),
        variacaoConversao: parsePercentValue(row[headerIndices.variacaoConversao]),
        marketplace: String(row[headerIndices.marketplace] || "").trim(),
      };
    })
    .filter((item: SalesRow | null): item is SalesRow => item !== null);

  return salesData;
}

async function syncToDatabase(salesData: SalesRow[]): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase environment variables not set");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { error } = await supabase
    .from("sheets_cache")
    .upsert(
      {
        id: "sheets-data",
        sheet_data: salesData,
        last_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    throw new Error(`Failed to update cache: ${error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const salesData = await fetchAndParseSheets();
    await syncToDatabase(salesData);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${salesData.length} records`,
        data: salesData,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
