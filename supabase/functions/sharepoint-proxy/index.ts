import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GOOGLE_SHEETS_ID = '1NIAAQFaqUImiPycs7Qf50rccwkuRfv54oUVo6N01WGo';
const GOOGLE_SHEETS_API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY') || '';

const GOOGLE_SHEETS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Sheet1!A1:L1000?key=${GOOGLE_SHEETS_API_KEY}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('📥 Buscando dados do Google Sheets API...');

    const response = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error(`❌ Erro ao buscar do Google Sheets: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Detalhes do erro:', errorText);

      return new Response(
        JSON.stringify({
          error: 'Erro ao buscar dados do Google Sheets',
          status: response.status,
          statusText: response.statusText,
          details: errorText
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const data = await response.json();
    console.log(`✅ Dados obtidos com sucesso: ${data.values?.length || 0} linhas`);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('❌ Erro na Edge Function:', error);
    return new Response(
      JSON.stringify({
        error: 'Erro ao processar requisição',
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});