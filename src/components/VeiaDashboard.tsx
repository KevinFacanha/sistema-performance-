import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getVeiaMensal,
  getVeiaPeriodos,
  getVeiaSummary,
  VeiaMonthlyPoint,
  VeiaPeriodOption,
  VeiaSummary,
} from '../lib/api';
import { currencyBRL, formatDateBR, numBR } from '../lib/format';

const initialVeiaSummary: VeiaSummary = {
  meses: 0,
  vendasBrutas1Total: 0,
  vendasBrutas2Total: 0,
  conta1Total: 0,
  conta2Total: 0,
  reembolsoC1Total: 0,
  reembolsoC2Total: 0,
  custoDevC1Total: 0,
  custoDevC2Total: 0,
};

type ChartContaOption = 'ambas' | '1' | '2';
type ChartSeries = { key: string; label: string; color: string; hasData: boolean };
type ChartRow = Record<string, string | number>;

const chartPalette = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#ef4444',
  '#14b8a6',
  '#a855f7',
  '#84cc16',
  '#fb923c',
];

function formatMes(mesAno: string) {
  if (!mesAno) return '';
  return formatDateBR(mesAno, 'MMM/yy');
}

function SkeletonCard() {
  return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
}

function formatCardValue(value: number, hideCurrencySymbol?: boolean) {
  const formatted = currencyBRL(value);
  if (!hideCurrencySymbol) return formatted;
  return formatted.replace(/^R\$\s*/, '').trim();
}

type SummaryCard = {
  label: string;
  value: number;
  hideCurrencySymbol?: boolean;
  formatter?: (value: number) => string;
  description?: string | null;
};

function createEmptyMonthlyBucket(mesAno: string): VeiaMonthlyPoint {
  return {
    mesAno,
    vendasBrutas1: 0,
    vendasBrutas2: 0,
    conta1: 0,
    countC1: 0,
    conta2: 0,
    countC2: 0,
    reembolsoC1: 0,
    reembolsoC2: 0,
    custoDevC1: 0,
    custoDevC2: 0,
    percentC1: null,
    percentC2: null,
  };
}

function mergeMonthlyRows(groups: VeiaMonthlyPoint[][]): VeiaMonthlyPoint[] {
  const map = new Map<string, VeiaMonthlyPoint>();
  groups.forEach((rows) => {
    rows.forEach((row) => {
      const key = row.mesAno;
      const bucket = map.get(key) || createEmptyMonthlyBucket(key);
      bucket.vendasBrutas1 += row.vendasBrutas1 || 0;
      bucket.vendasBrutas2 += row.vendasBrutas2 || 0;
      bucket.conta1 += row.conta1 || 0;
      bucket.conta2 += row.conta2 || 0;
      bucket.countC1 += row.countC1 || row.conta1 || 0;
      bucket.countC2 += row.countC2 || row.conta2 || 0;
      bucket.reembolsoC1 += row.reembolsoC1 || 0;
      bucket.reembolsoC2 += row.reembolsoC2 || 0;
      bucket.custoDevC1 += row.custoDevC1 || 0;
      bucket.custoDevC2 += row.custoDevC2 || 0;
      if (!bucket.percentC1 && row.percentC1) bucket.percentC1 = row.percentC1;
      if (!bucket.percentC2 && row.percentC2) bucket.percentC2 = row.percentC2;
      map.set(key, bucket);
    });
  });
  return Array.from(map.values()).sort((a, b) => a.mesAno.localeCompare(b.mesAno));
}

function buildSummaryFromMonthly(rows: VeiaMonthlyPoint[]): VeiaSummary {
  return rows.reduce(
    (acc, row) => {
      acc.vendasBrutas1Total += row.vendasBrutas1 || 0;
      acc.vendasBrutas2Total += row.vendasBrutas2 || 0;
      acc.conta1Total += row.conta1 || 0;
      acc.conta2Total += row.conta2 || 0;
      acc.reembolsoC1Total += row.reembolsoC1 || 0;
      acc.reembolsoC2Total += row.reembolsoC2 || 0;
      acc.custoDevC1Total += row.custoDevC1 || 0;
      acc.custoDevC2Total += row.custoDevC2 || 0;
      return acc;
    },
    {
      meses: rows.length,
      vendasBrutas1Total: 0,
      vendasBrutas2Total: 0,
      conta1Total: 0,
      conta2Total: 0,
      reembolsoC1Total: 0,
      reembolsoC2Total: 0,
      custoDevC1Total: 0,
      custoDevC2Total: 0,
    } as VeiaSummary
  );
}

function buildBaseChart(mensal: VeiaMonthlyPoint[], showConta1: boolean, showConta2: boolean) {
  const baseSeries: ChartSeries[] = [];
  if (showConta1) baseSeries.push({ key: 'vendasBrutas1', label: 'Conta 1', color: chartPalette[0], hasData: true });
  if (showConta2) baseSeries.push({ key: 'vendasBrutas2', label: 'Conta 2', color: chartPalette[1], hasData: true });
  const baseRows: ChartRow[] = mensal.map((item) => {
    const row: ChartRow = { mesAno: item.mesAno };
    if (showConta1) row.vendasBrutas1 = item.vendasBrutas1 || 0;
    if (showConta2) row.vendasBrutas2 = item.vendasBrutas2 || 0;
    return row;
  });
  return { series: baseSeries, rows: baseRows };
}

function buildStatusChartData(
  rowsByStatus: VeiaMonthlyPoint[][],
  statusLabels: string[],
  showConta1: boolean,
  showConta2: boolean
) {
  const monthMap = new Map<string, ChartRow>();
  const seriesList: ChartSeries[] = [];
  let colorIndex = 0;

  rowsByStatus.forEach((rows, idx) => {
    const label = statusLabels[idx] || `Status ${idx + 1}`;
    let hasC1 = false;
    let hasC2 = false;
    rows.forEach((row) => {
      const bucket = monthMap.get(row.mesAno) || { mesAno: row.mesAno };
      if (showConta1) {
        const key = `c1_${idx}`;
        const next = (bucket[key] as number | undefined || 0) + (row.vendasBrutas1 || 0);
        bucket[key] = next;
        if (next !== 0) hasC1 = true;
      }
      if (showConta2) {
        const key = `c2_${idx}`;
        const next = (bucket[key] as number | undefined || 0) + (row.vendasBrutas2 || 0);
        bucket[key] = next;
        if (next !== 0) hasC2 = true;
      }
      monthMap.set(row.mesAno, bucket);
    });

    if (showConta1 && hasC1) {
      seriesList.push({
        key: `c1_${idx}`,
        label: `Conta 1 — ${label}`,
        color: chartPalette[colorIndex % chartPalette.length],
        hasData: true,
      });
      colorIndex += 1;
    }
    if (showConta2 && hasC2) {
      seriesList.push({
        key: `c2_${idx}`,
        label: `Conta 2 — ${label}`,
        color: chartPalette[colorIndex % chartPalette.length],
        hasData: true,
      });
      colorIndex += 1;
    }
  });

  const allKeys = seriesList.map((series) => series.key);
  const rows = Array.from(monthMap.values())
    .map((row) => {
      const result: ChartRow = { ...row };
      allKeys.forEach((key) => {
        if (result[key] === undefined) {
          result[key] = 0;
        }
      });
      return result;
    })
    .sort((a, b) => String(a.mesAno).localeCompare(String(b.mesAno)));

  return { series: seriesList, rows };
}

export function VeiaDashboard() {
  const [summaryBase, setSummaryBase] = useState<VeiaSummary>(initialVeiaSummary);
  const [mensalBase, setMensalBase] = useState<VeiaMonthlyPoint[]>([]);
  const [summary, setSummary] = useState<VeiaSummary>(initialVeiaSummary);
  const [mensal, setMensal] = useState<VeiaMonthlyPoint[]>([]);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([]);
  const [modalidade, setModalidade] = useState<string>('');
  const [periodo, setPeriodo] = useState<string>('');
  const [modalidadeOptions, setModalidadeOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [periodoOptions, setPeriodoOptions] = useState<VeiaPeriodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartConta, setChartConta] = useState<ChartContaOption>('ambas');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);

  const showConta1Line = chartConta === 'ambas' || chartConta === '1';
  const showConta2Line = chartConta === 'ambas' || chartConta === '2';

  const buildFilters = useCallback(
    () => ({
      modalidade: modalidade || undefined,
      periodo: periodo || undefined,
    }),
    [modalidade, periodo]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = buildFilters();
      const [summaryData, mensalResponse] = await Promise.all([
        getVeiaSummary(filters),
        getVeiaMensal(filters),
      ]);
      setSummaryBase(summaryData);
      setMensalBase(mensalResponse.meses);
      setModalidadeOptions(mensalResponse.modalidades || []);
      setStatusOptions(mensalResponse.status || []);

      if (!selectedStatuses.length) {
        const { series, rows } = buildBaseChart(mensalResponse.meses, showConta1Line, showConta2Line);
        setSummary(summaryData);
        setMensal(mensalResponse.meses);
        setChartSeries(series);
        setChartData(rows);
        setChartLoading(false);
      }
    } catch (err) {
      console.error('Erro ao carregar dados VEIA:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados VEIA');
    } finally {
      setLoading(false);
    }
  }, [buildFilters, selectedStatuses.length, showConta1Line, showConta2Line]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!statusDropdownOpen) return () => {};
    const handleClick = (event: MouseEvent) => {
      if (!statusFilterRef.current) return;
      if (!statusFilterRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [statusDropdownOpen]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedStatuses.length) {
        const { series, rows } = buildBaseChart(mensalBase, showConta1Line, showConta2Line);
        setSummary(summaryBase);
        setMensal(mensalBase);
        setChartSeries(series);
        setChartData(rows);
        setChartLoading(false);
        return;
      }

      setChartLoading(true);
      try {
        const filters = buildFilters();
        const responses = await Promise.all(
          selectedStatuses.map((statusValue) => getVeiaMensal({ ...filters, status: statusValue }))
        );
        if (cancelled) return;

        const rowsByStatus = responses.map((resp) => resp?.meses || []);
        const mergedMonthly = mergeMonthlyRows(rowsByStatus);
        setMensal(mergedMonthly);
        setSummary(buildSummaryFromMonthly(mergedMonthly));

        const { series, rows } = buildStatusChartData(rowsByStatus, selectedStatuses, showConta1Line, showConta2Line);
        setChartSeries(series);
        setChartData(rows);
      } catch (err) {
        if (cancelled) return;
        console.error('Erro ao carregar dados do gráfico VEIA:', err);
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados do gráfico VEIA');
      } finally {
        if (!cancelled) {
          setChartLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedStatuses, buildFilters, mensalBase, summaryBase, showConta1Line, showConta2Line]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const options = await getVeiaPeriodos();
        if (cancelled) return;
        setPeriodoOptions(options);
      } catch (err) {
        console.error('Erro ao carregar períodos VEIA:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!periodo) return;
    const exists = periodoOptions.some((option) => option.value === periodo);
    if (!exists) {
      setPeriodo('');
    }
  }, [periodo, periodoOptions]);

  useEffect(() => {
    if (!selectedStatuses.length) return;
    const valid = selectedStatuses.filter((value) => statusOptions.includes(value));
    if (valid.length !== selectedStatuses.length) {
      setSelectedStatuses(valid);
    }
  }, [selectedStatuses, statusOptions]);

  const veiaCountMetrics = useMemo(() => {
    let countC1 = 0;
    let countC2 = 0;
    let percentC1: string | null = null;
    let percentC2: string | null = null;

    mensal.forEach((item) => {
      countC1 += item.countC1 ?? 0;
      countC2 += item.countC2 ?? 0;
      if (!percentC1 && item.percentC1) {
        percentC1 = item.percentC1;
      }
      if (!percentC2 && item.percentC2) {
        percentC2 = item.percentC2;
      }
    });

    return { countC1, countC2, percentC1, percentC2 };
  }, [mensal]);

  const chartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const rows = payload.map((item: any) => ({
      name: item?.name || item?.dataKey,
      value: Number(item?.value || 0),
    }));
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-slate-900">{formatMes(String(label ?? ''))}</p>
        <div className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-8">
              <span className="text-slate-500">{row.name}</span>
              <span className="font-semibold text-slate-900">{numBR(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }, []);

  const cards: SummaryCard[] = useMemo(
    () => [
      { label: 'Vendas Brutas (1)', value: summary.vendasBrutas1Total, formatter: (value) => numBR(value) },
      { label: 'Vendas Brutas (2)', value: summary.vendasBrutas2Total, formatter: (value) => numBR(value) },
      { label: 'Reembolsos C1', value: summary.reembolsoC1Total },
      { label: 'Reembolsos C2', value: summary.reembolsoC2Total },
      { label: 'Custos Devolução C1', value: summary.custoDevC1Total },
      { label: 'Custos Devolução C2', value: summary.custoDevC2Total },
      {
        label: 'Conta 1',
        value: veiaCountMetrics.countC1,
        formatter: (value) => numBR(value),
        description: veiaCountMetrics.percentC1 ? `% C1: ${veiaCountMetrics.percentC1}` : '% C1: —',
      },
      {
        label: 'Conta 2',
        value: veiaCountMetrics.countC2,
        formatter: (value) => numBR(value),
        description: veiaCountMetrics.percentC2 ? `% C2: ${veiaCountMetrics.percentC2}` : '% C2: —',
      },
    ],
    [summary, veiaCountMetrics]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <span role="img" aria-hidden="true">📊</span>
          Análise VEIA (Consolidado por Mês)
        </h2>
        <p className="text-sm text-gray-500">
          Totais consolidados da aba "Consolidado" com filtros de Modalidade e Status.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 min-w-[160px] flex-col">
          <label className="text-sm font-semibold text-gray-700">Modalidade</label>
          <select
            className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            value={modalidade}
            onChange={(event) => setModalidade(event.target.value)}
          >
            <option value="">Todas</option>
            {modalidadeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col" ref={statusFilterRef}>
          <label className="text-sm font-semibold text-gray-700">Status (múltiplos)</label>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            onClick={() => setStatusDropdownOpen((open) => !open)}
          >
            <span>
              {selectedStatuses.length === 0
                ? 'Todos'
                : `${selectedStatuses.length} status selecionado${selectedStatuses.length > 1 ? 's' : ''}`}
            </span>
            <svg
              className={`h-4 w-4 transform transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {statusDropdownOpen && (
            <div className="relative z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedStatuses.length === 0}
                  onChange={() => setSelectedStatuses([])}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Todos</span>
              </label>
              <div className="mt-2 max-h-48 space-y-1 overflow-auto pr-1">
                {statusOptions.map((option) => {
                  const checked = selectedStatuses.includes(option);
                  return (
                    <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            setSelectedStatuses(selectedStatuses.filter((value) => value !== option));
                          } else {
                            setSelectedStatuses([...selectedStatuses, option]);
                          }
                        }}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <span className="mt-1 text-xs text-gray-500">
            Selecione um ou mais status; nenhum selecionado significa Todos.
          </span>
        </div>
        <div className="flex flex-1 min-w-[160px] flex-col">
          <label className="text-sm font-semibold text-gray-700">Período (Mês/Ano)</label>
          <select
            className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value)}
          >
            <option value="">Todos</option>
            {periodoOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading
          ? cards.map((_, index) => <SkeletonCard key={`sk-${index}`} />)
          : cards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">
                  {card.formatter
                    ? card.formatter(card.value)
                    : formatCardValue(card.value, card.hideCurrencySymbol)}
                </p>
                {card.description && (
                  <p className="mt-1 text-xs font-medium text-gray-500">{card.description}</p>
                )}
              </div>
            ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">Vendas Brutas por Mês</p>
            <p className="text-sm text-gray-500">Comparação entre contas, por mês/ano.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-700">Conta</label>
              <select
                className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                value={chartConta}
                onChange={(event) => setChartConta(event.target.value as ChartContaOption)}
              >
                <option value="ambas">Ambas</option>
                <option value="1">Conta 1</option>
                <option value="2">Conta 2</option>
              </select>
            </div>
          </div>
        </div>
        {loading || chartLoading ? (
          <div className="space-y-4">
            <div className="h-6 w-1/3 rounded-full bg-slate-100" />
            <div className="h-[280px] rounded-2xl bg-slate-100" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
            Nenhum dado encontrado para os filtros selecionados.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="mesAno"
                tickFormatter={(value) => formatMes(String(value))}
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(value) => currencyBRL(Number(value)).replace('R$', '').trim()}
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <Tooltip content={chartTooltip} />
              <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 12 }} />
              {chartSeries
                .filter((series) => series.hasData)
                .map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={series.color}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
