import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { DateFilter } from './DateFilter';
import { CompareKpiCard } from './CompareKpiCard';
import { CompareMonthlyChart } from './CompareMonthlyChart';
import {
  ComparativoMensalItem,
  ComparativoSummaryResponse,
  getComparativoMensal,
  getComparativoSummary,
} from '../lib/api';
import { formatDateBR } from '../lib/format';

const COMPARE_PREFS_KEY = 'comparePrefs';
const TODAY = () => new Date().toISOString().slice(0, 10);

interface ComparePrefs {
  contaA: string;
  contaB: string;
  de?: string;
  ate?: string;
  marketplace?: string;
}

interface CompareViewProps {
  onPdfInfoChange?: (info: { fileName: string }) => void;
  onRegisterRefresh?: (handler: (() => void) | null) => void;
  marketplaceOptions?: string[];
}

function readPrefs(): ComparePrefs {
  if (typeof window === 'undefined') {
    return { contaA: '1', contaB: '2' };
  }
  try {
    const raw = localStorage.getItem(COMPARE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ComparePrefs;
      return {
        contaA: parsed.contaA || '1',
        contaB: parsed.contaB || '2',
        de: parsed.de || '',
        ate: parsed.ate || '',
        marketplace: parsed.marketplace || '',
      };
    }
  } catch {
    // ignore parse errors
  }
  return { contaA: '1', contaB: '2' };
}

function buildComparePdfFileName(prefs: ComparePrefs) {
  const startPart = prefs.de || TODAY();
  const endPart = prefs.ate && prefs.ate !== prefs.de ? `_${prefs.ate}` : '';
  const marketplaceSlug = prefs.marketplace
    ? prefs.marketplace.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
    : 'todos';
  return `Comparativo_${prefs.contaA}x${prefs.contaB}_${startPart}${endPart}_${marketplaceSlug}.pdf`;
}

function sanitizeMarketplace(value: string) {
  return value?.trim() ? value.trim() : '';
}

export const CompareView = forwardRef<HTMLDivElement, CompareViewProps>(function CompareView(
  { onPdfInfoChange, onRegisterRefresh, marketplaceOptions = [] },
  ref
) {
  const initialPrefs = useMemo(() => readPrefs(), []);
  const [contaA, setContaA] = useState(initialPrefs.contaA);
  const [contaB, setContaB] = useState(initialPrefs.contaB);
  const [start, setStart] = useState(initialPrefs.de || '');
  const [end, setEnd] = useState(initialPrefs.ate || '');
  const [marketplace, setMarketplace] = useState(initialPrefs.marketplace || '');

  const [summary, setSummary] = useState<ComparativoSummaryResponse | null>(null);
  const [mensal, setMensal] = useState<ComparativoMensalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const filters = useMemo(
    () => ({
      contaA,
      contaB,
      de: start || undefined,
      ate: end || undefined,
      marketplace: marketplace ? marketplace.toLowerCase() : undefined,
    }),
    [contaA, contaB, start, end, marketplace]
  );

  const persistPrefs = useCallback(() => {
    if (typeof window === 'undefined') return;
    const payload: ComparePrefs = {
      contaA,
      contaB,
      de: start || '',
      ate: end || '',
      marketplace: marketplace || '',
    };
    try {
      localStorage.setItem(COMPARE_PREFS_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
    onPdfInfoChange?.({ fileName: buildComparePdfFileName(payload) });
  }, [contaA, contaB, start, end, marketplace, onPdfInfoChange]);

  useEffect(() => {
    persistPrefs();
  }, [persistPrefs]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, mensalData] = await Promise.all([
        getComparativoSummary(filters),
        getComparativoMensal(filters),
      ]);
      setSummary(summaryData);
      setMensal(mensalData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Erro ao carregar comparativo:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar comparativo');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!onRegisterRefresh) return;
    onRegisterRefresh(loadData);
    return () => onRegisterRefresh(null);
  }, [onRegisterRefresh, loadData]);

  const contaALabel = useMemo(() => `Conta ${contaA}`, [contaA]);
  const contaBLabel = useMemo(() => `Conta ${contaB}`, [contaB]);

  const resumoA = summary?.contaA?.resumo;
  const resumoB = summary?.contaB?.resumo;
  const delta = summary?.delta;

  const kpis = summary
    ? [
        {
          label: 'Faturamento Total',
          valueA: resumoA?.faturamentoTotal ?? 0,
          valueB: resumoB?.faturamentoTotal ?? 0,
          delta: delta?.faturamentoTotal ?? 0,
          format: 'currency' as const,
        },
        {
          label: 'Total de Vendas',
          valueA: resumoA?.vendasTotais ?? 0,
          valueB: resumoB?.vendasTotais ?? 0,
          delta: delta?.vendasTotais ?? 0,
          format: 'number' as const,
        },
        {
          label: 'Ticket Médio',
          valueA: resumoA?.ticketMedio ?? 0,
          valueB: resumoB?.ticketMedio ?? 0,
          delta: delta?.ticketMedio ?? 0,
          format: 'currency' as const,
        },
        {
          label: 'Total de Visitas',
          valueA: resumoA?.visitas ?? 0,
          valueB: resumoB?.visitas ?? 0,
          delta: delta?.visitas ?? 0,
          format: 'number' as const,
        },
        {
          label: 'Taxa de Conversão',
          valueA: resumoA?.taxaConversao ?? 0,
          valueB: resumoB?.taxaConversao ?? 0,
          delta: delta?.taxaConversao ?? 0,
          format: 'percent' as const,
        },
      ]
    : [];

  const activeFilters = useMemo(() => {
    const chips: { label: string; value: string; type: 'date' | 'marketplace' }[] = [];
    if (start) {
      chips.push({
        label: 'Início',
        value: formatDateBR(start),
        type: 'date',
      });
    }
    if (end) {
      chips.push({
        label: 'Fim',
        value: formatDateBR(end),
        type: 'date',
      });
    }
    if (marketplace) {
      chips.push({
        label: 'Marketplace',
        value: marketplace,
        type: 'marketplace',
      });
    }
    return chips;
  }, [start, end, marketplace]);

  return (
    <div ref={ref} className="space-y-6">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Comparativo
            </p>
            <h2 className="text-3xl font-bold text-gray-900">Conta A x Conta B</h2>
            <p className="text-sm text-gray-500">
              Última atualização: {lastUpdated ? lastUpdated.toLocaleString('pt-BR') : '—'}
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar dados
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Conta A</p>
                <p className="text-xl font-semibold text-gray-900">{contaALabel}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setContaA(contaB);
                  setContaB(contaA);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Inverter
              </button>
            </div>
            <select
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              value={contaA}
              onChange={(event) => setContaA(event.target.value)}
            >
              <option value="1">Conta 1</option>
              <option value="2">Conta 2</option>
            </select>
          </div>
          <div className="rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Conta B</p>
            <p className="text-xl font-semibold text-gray-900">{contaBLabel}</p>
            <select
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              value={contaB}
              onChange={(event) => setContaB(event.target.value)}
            >
              <option value="1">Conta 1</option>
              <option value="2">Conta 2</option>
            </select>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <DateFilter
            startDate={start}
            endDate={end}
            onStartDateChange={(value) => setStart(value)}
            onEndDateChange={(value) => setEnd(value)}
            onReset={() => {
              setStart('');
              setEnd('');
            }}
          />

          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Marketplace</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Todos"
                  list="compare-marketplaces"
                  value={marketplace}
                  onChange={(event) => setMarketplace(sanitizeMarketplace(event.target.value))}
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <datalist id="compare-marketplaces">
                  {marketplaceOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                {marketplace && (
                  <button
                    type="button"
                    onClick={() => setMarketplace('')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {activeFilters.map((chip) => (
                <span
                  key={`${chip.label}-${chip.value}`}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1 text-xs font-semibold text-blue-700"
                >
                  {chip.label}: {chip.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={`skeleton-${index}`} className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
          ))
        ) : (
          kpis.map((item) => (
            <CompareKpiCard
              key={item.label}
              label={item.label}
              valueA={item.valueA}
              valueB={item.valueB}
              delta={item.delta}
              contaALabel={contaALabel}
              contaBLabel={contaBLabel}
              format={item.format}
            />
          ))
        )}
      </div>

      <CompareMonthlyChart
        data={mensal}
        loading={loading}
        contaALabel={contaALabel}
        contaBLabel={contaBLabel}
      />
    </div>
  );
});
