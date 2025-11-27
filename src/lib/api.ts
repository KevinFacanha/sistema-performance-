export interface DashboardFilters extends Record<string, unknown> {
  start?: string;
  end?: string;
  conta?: string;
  marketplace?: string;
  page?: number;
  limit?: number;
}

export interface VeiaFilters extends Record<string, unknown> {
  conta?: string;
  de?: string;
  ate?: string;
  modalidade?: string | null;
  status?: string | null;
  periodo?: string | null;
}

export interface DashboardSummary {
  faturamentoTotal: number;
  vendasTotais: number;
  ticketMedio: number;
  visitas: number;
  taxaConversao: number;
  variacaoFatMedia: number | null;
  variacaoVendasMedia: number | null;
  variacaoTicketMedia: number | null;
  variacaoVisitasMedia: number | null;
  variacaoTxConversaoMedia: number | null;
}

export interface DashboardRow {
  conta?: string;
  dateISO: string;
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  visitas: number;
  taxaConversao: number;
  variacaoFat?: number | null;
  variacaoVendas?: number | null;
  variacaoTicket?: number | null;
  variacaoVisitas?: number | null;
  variacaoTxConversao?: number | null;
  marketplace?: string;
}

export interface DashboardDetalhadoResponse {
  linhas: DashboardRow[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface MonthlyPoint {
  mesISO: string;
  faturamento: number;
  vendas: number;
}

export interface VeiaSummary {
  meses: number;
  vendasBrutas1Total: number;
  vendasBrutas2Total: number;
  conta1Total: number;
  conta2Total: number;
  reembolsoC1Total: number;
  reembolsoC2Total: number;
  custoDevC1Total: number;
  custoDevC2Total: number;
}

export interface VeiaMonthlyPoint {
  mesAno: string;
  vendasBrutas1: number;
  vendasBrutas2: number;
  conta1: number;
  countC1: number;
  conta2: number;
  countC2: number;
  reembolsoC1: number;
  reembolsoC2: number;
  custoDevC1: number;
  custoDevC2: number;
  percentC1: string | null;
  percentC2: string | null;
}

export interface VeiaMensalResponse {
  meses: VeiaMonthlyPoint[];
  modalidades: string[];
  status: string[];
}

export interface VeiaPeriodOption {
  value: string;
  label: string;
}

export interface ComparativoFilters extends Record<string, unknown> {
  contaA: string;
  contaB: string;
  de?: string;
  ate?: string;
  marketplace?: string;
}

export interface ComparativoContaResumo {
  id: number;
  sheetId: string;
  resumo: DashboardSummary;
}

export interface ComparativoDelta {
  faturamentoTotal: number;
  vendasTotais: number;
  ticketMedio: number;
  visitas: number;
  taxaConversao: number;
}

export interface ComparativoSummaryResponse {
  contaA: ComparativoContaResumo;
  contaB: ComparativoContaResumo;
  delta: ComparativoDelta;
}

export interface ComparativoMensalItem {
  mesAno: string;
  A: { fat: number; vendas: number };
  B: { fat: number; vendas: number };
}

export interface CurvaAbcMudanca {
  codigo: string;
  anterior: string | null;
  atual: string | null;
  periodo_anterior: string | null;
  periodo_atual: string | null;
  marketplace: string | null;
}

export function buildQuery(
  params: DashboardFilters | Record<string, unknown> = {},
  account?: string
): string {
  const search = new URLSearchParams();
  const payload: Record<string, unknown> = { ...params };

  const existingConta = payload['conta'];
  const normalizedAccount = account ?? (typeof existingConta === 'string' ? existingConta : undefined);
  if (normalizedAccount !== undefined && normalizedAccount !== null) {
    payload['conta'] = normalizedAccount;
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return;
    }
    search.append(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

function normalizeSummary(data: any = {}): DashboardSummary {
  return {
    faturamentoTotal: Number(data.faturamentoTotal) || 0,
    vendasTotais: Number(data.vendasTotais) || 0,
    ticketMedio: Number(data.ticketMedio) || 0,
    visitas: Number(data.visitas) || 0,
    taxaConversao: Number(data.taxaConversao) || 0,
    variacaoFatMedia:
      data?.variacaoFatMedia === null || data?.variacaoFatMedia === undefined
        ? null
        : Number(data.variacaoFatMedia),
    variacaoVendasMedia:
      data?.variacaoVendasMedia === null || data?.variacaoVendasMedia === undefined
        ? null
        : Number(data.variacaoVendasMedia),
    variacaoTicketMedia:
      data?.variacaoTicketMedia === null || data?.variacaoTicketMedia === undefined
        ? null
        : Number(data.variacaoTicketMedia),
    variacaoVisitasMedia:
      data?.variacaoVisitasMedia === null || data?.variacaoVisitasMedia === undefined
        ? null
        : Number(data.variacaoVisitasMedia),
    variacaoTxConversaoMedia:
      data?.variacaoTxConversaoMedia === null ||
      data?.variacaoTxConversaoMedia === undefined
        ? null
        : Number(data.variacaoTxConversaoMedia),
  };
}

function normalizeComparativoConta(entry: any): ComparativoContaResumo {
  return {
    id: Number(entry?.id) || 0,
    sheetId: String(entry?.sheetId || ''),
    resumo: normalizeSummary(entry?.resumo || {}),
  };
}

function normalizeComparativoDelta(entry: any = {}): ComparativoDelta {
  return {
    faturamentoTotal: Number(entry?.faturamentoTotal) || 0,
    vendasTotais: Number(entry?.vendasTotais) || 0,
    ticketMedio: Number(entry?.ticketMedio) || 0,
    visitas: Number(entry?.visitas) || 0,
    taxaConversao: Number(entry?.taxaConversao) || 0,
  };
}

function normalizeRow(row: any): DashboardRow {
  const dateISO = row?.dateISO || row?.dateIso || row?.date || '';
  if (!dateISO) {
    throw new Error('Linha sem campo "dateISO"');
  }

  return {
    conta: row?.conta,
    dateISO,
    faturamento: Number(row?.faturamento) || 0,
    vendas: Number(row?.vendas) || 0,
    ticketMedio: Number(row?.ticketMedio) || 0,
    visitas: Number(row?.visitas) || 0,
    taxaConversao: Number(row?.taxaConversao) || 0,
    variacaoFat:
      row?.variacaoFat === null || row?.variacaoFat === undefined
        ? null
        : Number(row.variacaoFat),
    variacaoVendas:
      row?.variacaoVendas === null || row?.variacaoVendas === undefined
        ? null
        : Number(row.variacaoVendas),
    variacaoTicket:
      row?.variacaoTicket === null || row?.variacaoTicket === undefined
        ? null
        : Number(row.variacaoTicket),
    variacaoVisitas:
      row?.variacaoVisitas === null || row?.variacaoVisitas === undefined
        ? null
        : Number(row.variacaoVisitas),
    variacaoTxConversao:
      row?.variacaoTxConversao === null ||
      row?.variacaoTxConversao === undefined
        ? null
        : Number(row.variacaoTxConversao),
    marketplace: row?.marketplace,
  };
}

function normalizeVeiaSummary(data: any = {}): VeiaSummary {
  return {
    meses: Number(data?.meses) || 0,
    vendasBrutas1Total: Number(data?.vendasBrutas1Total) || 0,
    vendasBrutas2Total: Number(data?.vendasBrutas2Total) || 0,
    conta1Total: Number(data?.conta1Total) || 0,
    conta2Total: Number(data?.conta2Total) || 0,
    reembolsoC1Total: Number(data?.reembolsoC1Total) || 0,
    reembolsoC2Total: Number(data?.reembolsoC2Total) || 0,
    custoDevC1Total: Number(data?.custoDevC1Total) || 0,
    custoDevC2Total: Number(data?.custoDevC2Total) || 0,
  };
}

function normalizeVeiaMonthlyRow(row: any): VeiaMonthlyPoint {
  const mesAno = row?.mesAno || row?.mesISO || row?.mes || '';
  if (!mesAno) {
    throw new Error('Linha VEIA sem campo mesAno');
  }
  const normalizePercent = (value: any): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    const str = String(value).trim();
    return str.length ? str : null;
  };

  return {
    mesAno,
    vendasBrutas1: Number(row?.vendasBrutas1) || 0,
    vendasBrutas2: Number(row?.vendasBrutas2) || 0,
    conta1: Number(row?.conta1) || 0,
    countC1: Number(row?.countC1 ?? row?.conta1) || 0,
    conta2: Number(row?.conta2) || 0,
    countC2: Number(row?.countC2 ?? row?.conta2) || 0,
    reembolsoC1: Number(row?.reembolsoC1) || 0,
    reembolsoC2: Number(row?.reembolsoC2) || 0,
    custoDevC1: Number(row?.custoDevC1) || 0,
    custoDevC2: Number(row?.custoDevC2) || 0,
    percentC1: normalizePercent(row?.percentC1 ?? row?.pctC1),
    percentC2: normalizePercent(row?.percentC2 ?? row?.pctC2),
  };
}

function formatVeiaPeriodLabel(value: string): string {
  if (!value) return '';
  const [year, month] = value.split('-');
  if (!year || !month) {
    return value;
  }
  return `${month.padStart(2, '0')}/${year}`;
}

function normalizeVeiaPeriodOption(entry: any): VeiaPeriodOption | null {
  if (!entry && entry !== 0) {
    return null;
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return { value: trimmed, label: formatVeiaPeriodLabel(trimmed) };
  }
  const value = entry?.value ?? entry?.mesAno ?? entry?.mes ?? null;
  if (!value) return null;
  const normalizedValue = String(value).trim();
  if (!normalizedValue) return null;
  const labelSource = entry?.label ? String(entry.label).trim() : null;
  return {
    value: normalizedValue,
    label: labelSource && labelSource.length ? labelSource : formatVeiaPeriodLabel(normalizedValue),
  };
}

function normalizeComparativoMensalRow(row: any): ComparativoMensalItem {
  const mesAno = row?.mesAno || row?.mesISO || row?.mes || '';
  if (!mesAno) {
    throw new Error('Linha do comparativo sem campo mesAno');
  }
  const safeA = row?.A || row?.contaA || {};
  const safeB = row?.B || row?.contaB || {};
  return {
    mesAno,
    A: {
      fat: Number(safeA?.fat) || 0,
      vendas: Number(safeA?.vendas) || 0,
    },
    B: {
      fat: Number(safeB?.fat) || 0,
      vendas: Number(safeB?.vendas) || 0,
    },
  };
}

function normalizeCurvaAbcMudanca(row: any): CurvaAbcMudanca {
  return {
    codigo: String(row?.codigo ?? row?.codigoAnuncio ?? '').trim(),
    anterior: row?.anterior !== undefined ? String(row?.anterior || '').trim() || null : null,
    atual: row?.atual !== undefined ? String(row?.atual || '').trim() || null : null,
    periodo_anterior: row?.periodo_anterior || row?.periodoAnterior || null,
    periodo_atual: row?.periodo_atual || row?.periodoAtual || null,
    marketplace: row?.marketplace ? String(row.marketplace).trim() : null,
  };
}

async function fetchJson<T>(path: string, filters?: Record<string, unknown>, account?: string): Promise<T> {
  const query = buildQuery(filters || {}, account);
  const response = await fetch(`${path}${query}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json();

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Falha ao buscar ${path}`);
  }

  return payload;
}

export async function getSummary(filters: DashboardFilters = {}, account = '1'): Promise<DashboardSummary> {
  const data: any = await fetchJson('/api/dashboard/summary', filters, account);
  return normalizeSummary(data?.resumo);
}

export async function getDetalhado(
  filters: DashboardFilters = {},
  account = '1'
): Promise<DashboardDetalhadoResponse> {
  const data: any = await fetchJson('/api/dashboard/detalhado', filters, account);
  const rawLinhas = Array.isArray(data?.linhas)
    ? data.linhas
    : Array.isArray(data?.rows)
      ? data.rows
      : [];

  return {
    linhas: rawLinhas.map(normalizeRow),
    total: typeof data?.total === 'number' ? data.total : Number(data?.total) || undefined,
    page: typeof data?.page === 'number' ? data.page : data?.page ? Number(data.page) : undefined,
    limit: typeof data?.limit === 'number' ? data.limit : data?.limit ? Number(data.limit) : undefined,
  };
}

export async function getMonthly(
  filters: DashboardFilters = {},
  account = '1'
): Promise<MonthlyPoint[]> {
  const data: any = await fetchJson('/api/dashboard/monthly', filters, account);
  const rawMeses = Array.isArray(data?.meses) ? data.meses : [];

  return rawMeses
    .map((row: any): MonthlyPoint => ({
      mesISO: row?.mesISO || row?.mesIso || row?.mes || '',
      faturamento: Number(row?.faturamento) || 0,
      vendas: Number(row?.vendas) || 0,
    }))
    .filter((item: MonthlyPoint): item is MonthlyPoint => Boolean(item.mesISO));
}

export async function getVeiaSummary(filters: VeiaFilters = {}): Promise<VeiaSummary> {
  const payload = { conta: '3', ...filters };
  const data: any = await fetchJson('/api/veia/summary', payload);
  return normalizeVeiaSummary(data?.resumo);
}

export async function getVeiaMensal(filters: VeiaFilters = {}): Promise<VeiaMensalResponse> {
  const payload = { conta: '3', ...filters };
  const data: any = await fetchJson('/api/veia/mensal', payload);
  const rawMeses = Array.isArray(data?.meses) ? data.meses : [];
  const meses = rawMeses.map(normalizeVeiaMonthlyRow);
  const modalidades = Array.isArray(data?.modalidades)
    ? data.modalidades.map((item: any) => String(item))
    : [];
  const statusLista = Array.isArray(data?.status)
    ? data.status.map((item: any) => String(item))
    : [];
  return { meses, modalidades, status: statusLista };
}

export async function getVeiaPeriodos(): Promise<VeiaPeriodOption[]> {
  const data: any = await fetchJson('/api/veia/consolidado', { conta: '3' });
  const rawPeriodos = Array.isArray(data?.periodos) ? data.periodos : [];
  return rawPeriodos
    .map(normalizeVeiaPeriodOption)
    .filter(
      (option: VeiaPeriodOption | null | undefined): option is VeiaPeriodOption =>
        Boolean(option && option.value)
    );
}

export async function getComparativoSummary(
  filters: ComparativoFilters
): Promise<ComparativoSummaryResponse> {
  const data: any = await fetchJson('/api/comparativo/summary', filters);
  if (!data) {
    throw new Error('Resposta inválida do comparativo');
  }
  return {
    contaA: normalizeComparativoConta(data.contaA),
    contaB: normalizeComparativoConta(data.contaB),
    delta: normalizeComparativoDelta(data.delta),
  };
}

export async function getComparativoMensal(
  filters: ComparativoFilters
): Promise<ComparativoMensalItem[]> {
  const data: any = await fetchJson('/api/comparativo/mensal', filters);
  const rawMeses = Array.isArray(data?.meses) ? data.meses : [];
  return rawMeses.map(normalizeComparativoMensalRow);
}

export async function getCurvaAbcMudancas(conta = 1): Promise<CurvaAbcMudanca[]> {
  const normalizedConta = Number.isFinite(conta) ? String(Math.round(conta)) : '1';
  const data: any = await fetchJson('/api/curvaabc/check', { conta: normalizedConta });
  const raw = Array.isArray(data?.mudancas) ? data.mudancas : [];
  return raw.map(normalizeCurvaAbcMudanca);
}

interface CurvaAbcAckPayload {
  conta: '1' | '2';
  codigo: string;
  periodoAtual: string;
  curva: string | null;
  marketplace: string | null;
}

export async function acknowledgeCurvaAbcChange({
  conta,
  codigo,
  periodoAtual,
  curva,
  marketplace,
}: CurvaAbcAckPayload): Promise<void> {
  const response = await fetch('/api/curvaabc/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conta,
      codigo,
      codigoAnuncio: codigo,
      periodo: periodoAtual,
      periodoAtual,
      curva,
      curvaAtual: curva,
      marketplace,
    }),
  });
  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Falha ao confirmar item da Curva ABC');
  }
}
