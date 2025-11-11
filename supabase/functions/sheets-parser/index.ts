import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// URL do Google Sheets em formato exportável
const SHEETS_ID = '1NIAAQFaqUImiPycs7Qf50rccwkuRfv54oUVo6N01WGo';
const SHEETS_URL = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/export?format=xlsx`;

// Função para validar data no formato brasileiro
function isValidBRDate(dateStr: string): boolean {
  if (!dateStr?.includes('/')) return false;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return false;
  
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1;
}

// Converter data do formato brasileiro (DD/MM/YYYY) para objeto Date
function parseBRDate(dateStr: string): Date | null {
  try {
    if (!dateStr || !isValidBRDate(dateStr)) {
      console.warn(`Data inválida encontrada: ${dateStr}`);
      return null;
    }

    const [day, month, year] = dateStr.split('/').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    
    if (isNaN(parsedDate.getTime())) {
      console.warn(`Não foi possível criar data válida para: ${dateStr}`);
      return null;
    }

    return parsedDate;
  } catch (error) {
    console.error(`Erro ao converter data ${dateStr}:`, error);
    return null;
  }
}

// Processar linha da planílha
function processRow(row: any[], headers: string[]): any | null {
  if (!row || row.length === 0) return null;

  const dataObj: any = {};
  
  // Verifica se há dados na linha
  const hasData = row.some(cell => cell !== null && cell !== undefined && cell !== '');
  if (!hasData) return null;

  headers.forEach((header, index) => {
    let value = row[index];
    
    if (header === 'Data') {
      value = parseBRDate(value);
    }
    
    dataObj[header] = value;
  });

  return dataObj;
}

Deno.serve(async (req) => {
  // Tratar preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log('🔄 Iniciando requisição para o Google Sheets...');
    
    // Baixar planílha do Google Sheets
    const sheetsResponse = await fetch(SHEETS_URL);
    
    if (!sheetsResponse.ok) {
      console.error(`❌ Erro ao buscar planílha: ${sheetsResponse.status}`);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar planílha' }),
        {
          status: sheetsResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Ler conteúdo da planílha
    const arrayBuffer = await sheetsResponse.arrayBuffer();
    console.log('🛠️ Processando planílha com XLSX...');
    
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log('🗒️ Convertendo para formato JSON...');
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (!rawData || rawData.length < 2) {
      console.warn('⚠️ Planílha vazia ou sem dados');
      return new Response(
        JSON.stringify({
          statusCode: 200,
          body: JSON.stringify([]),
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        })
      );
    }

    // Processar cabeçalho
    const headers = rawData[0].map(h => String(h).trim());
    console.log('📊 Cabeçalhos da planílha:', headers);

    // Processar linhas de dados
    const data = [];
    const totalRows = rawData.length - 1;
    let processedCount = 0;
    
    console.log(`🔄 Processando ${totalRows} linhas...`);
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const processedRow = processRow(row, headers);
      
      if (processedRow) {
        // Validar se data é válida
        if (processedRow.Data && processedRow.Data instanceof Date) {
          data.push(processedRow);
          processedCount++;
        } else {
          console.warn(`⚠️ Linha ${i + 1}: Data inválida`, row[0]);
        }
      }
    }

    console.log(`✅ Planílha processada com sucesso: ${data.length} linhas válidas de ${totalRows} registros`);

    // Ordenar dados por data
    const sortedData = data.sort((a, b) => a.Data - b.Data);

    // Retornar resposta
    return new Response(
      JSON.stringify(sortedData),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store' // Evitar cache
        }
      }
    );

  } catch (error) {
    console.error('🔥 Erro ao processar planílha:', error);
    return new Response(
      JSON.stringify({
        error: 'Erro interno ao processar dados',
        message: error.message
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});