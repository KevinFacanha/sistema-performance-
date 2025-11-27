import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Users,
  Percent,
  BarChart3,
  RefreshCw,
  X,
  LogOut,
  FileDown,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { DateFilter } from './components/DateFilter';
import { KPICard } from './components/KPICard';
import { SalesChart } from './components/SalesChart';
import { ConversionChart } from './components/ConversionChart';
import { MonthlyComparisonChart } from './components/MonthlyComparisonChart';
import { CompareView } from './components/CompareView';
import { VeiaDashboard } from './components/VeiaDashboard';
import {
  CurvaAbcMudanca,
  DashboardRow,
  DashboardSummary,
  MonthlyPoint,
  acknowledgeCurvaAbcChange,
  getCurvaAbcMudancas,
  getDetalhado,
  getMonthly,
  getSummary,
} from './lib/api';
import {
  currencyBRL,
  formatDateBR,
  numBR,
  percentBR,
} from './lib/format';

const initialSummary: DashboardSummary = {
  faturamentoTotal: 0,
  vendasTotais: 0,
  ticketMedio: 0,
  visitas: 0,
  taxaConversao: 0,
  variacaoFatMedia: null,
  variacaoVendasMedia: null,
  variacaoTicketMedia: null,
  variacaoVisitasMedia: null,
  variacaoTxConversaoMedia: null,
};

const ACCOUNT_STORAGE_KEY = 'account';

const ACCOUNT_OPTIONS = [
  { value: '1', label: 'CONTA 1' },
  { value: '2', label: 'CONTA 2' },
  { value: '3', label: 'CONTA 3 (VEIA)' },
];

type CurvaAbcFilter = 'all' | 'up' | 'down';
type CurvaAbcTrend = 'up' | 'down' | 'equal';

const CURVA_ABC_VALUES: Record<string, number> = {
  A: 3,
  B: 2,
  C: 1,
};

const CURVA_ABC_FILTER_OPTIONS: { value: CurvaAbcFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'up', label: 'Melhoraram' },
  { value: 'down', label: 'Pioraram' },
];

const getCurvaAbcValue = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return CURVA_ABC_VALUES[normalized] ?? null;
};

const getCurvaAbcTrend = (anterior: string | null, atual: string | null): CurvaAbcTrend => {
  const previous = getCurvaAbcValue(anterior);
  const current = getCurvaAbcValue(atual);
  if (previous === null || current === null) {
    return 'equal';
  }
  if (current > previous) {
    return 'up';
  }
  if (current < previous) {
    return 'down';
  }
  return 'equal';
};
const getCurvaAbcRowKey = (item: CurvaAbcMudanca): string => {
  const codigo = (item?.codigo || '').trim();
  const periodoAtual = (item?.periodo_atual || '').trim();
  const marketplace = (item?.marketplace || '').trim() || 'global';
  if (codigo && periodoAtual) {
    return `${codigo}_${periodoAtual}_${marketplace}`;
  }
  return `${codigo || 'item'}_${periodoAtual || 'periodo'}_${item?.atual || 'curva'}_${marketplace}`;
};

function aggregateByDate(rows: DashboardRow[]): DashboardRow[] {
  const groups = new Map<string, DashboardRow[]>();
  rows.forEach((row) => {
    const current = groups.get(row.dateISO) || [];
    current.push(row);
    groups.set(row.dateISO, current);
  });

  return Array.from(groups.entries())
    .map(([dateISO, group]) => {
      const aggregate = group.reduce(
        (acc, row) => {
          acc.faturamento += row.faturamento || 0;
          acc.vendas += row.vendas || 0;
          acc.visitas += row.visitas || 0;

          if (row.variacaoFat !== null && row.variacaoFat !== undefined && !Number.isNaN(row.variacaoFat)) {
            acc.variacaoFatSum += row.variacaoFat;
            acc.variacaoFatCount += 1;
          }
          if (row.variacaoVendas !== null && row.variacaoVendas !== undefined && !Number.isNaN(row.variacaoVendas)) {
            acc.variacaoVendasSum += row.variacaoVendas;
            acc.variacaoVendasCount += 1;
          }
          if (row.variacaoTicket !== null && row.variacaoTicket !== undefined && !Number.isNaN(row.variacaoTicket)) {
            acc.variacaoTicketSum += row.variacaoTicket;
            acc.variacaoTicketCount += 1;
          }
          if (row.variacaoVisitas !== null && row.variacaoVisitas !== undefined && !Number.isNaN(row.variacaoVisitas)) {
            acc.variacaoVisitasSum += row.variacaoVisitas;
            acc.variacaoVisitasCount += 1;
          }
          if (
            row.variacaoTxConversao !== null &&
            row.variacaoTxConversao !== undefined &&
            !Number.isNaN(row.variacaoTxConversao)
          ) {
            acc.variacaoTxConversaoSum += row.variacaoTxConversao;
            acc.variacaoTxConversaoCount += 1;
          }

          return acc;
        },
        {
          faturamento: 0,
          vendas: 0,
          visitas: 0,
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

      const avg = (sum: number, count: number) => (count > 0 ? sum / count : null);

      const vendas = aggregate.vendas;
      const visitas = aggregate.visitas;

      return {
        dateISO,
        faturamento: aggregate.faturamento,
        vendas,
        ticketMedio: vendas ? aggregate.faturamento / vendas : 0,
        visitas,
        taxaConversao: visitas ? (vendas / visitas) * 100 : 0,
        variacaoFat: avg(aggregate.variacaoFatSum, aggregate.variacaoFatCount),
        variacaoVendas: avg(aggregate.variacaoVendasSum, aggregate.variacaoVendasCount),
        variacaoTicket: avg(aggregate.variacaoTicketSum, aggregate.variacaoTicketCount),
        variacaoVisitas: avg(aggregate.variacaoVisitasSum, aggregate.variacaoVisitasCount),
        variacaoTxConversao: avg(
          aggregate.variacaoTxConversaoSum,
          aggregate.variacaoTxConversaoCount
        ),
      } as DashboardRow;
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

interface AppProps {
  onLogout?: () => void;
}

function App({ onLogout }: AppProps = {}) {
  const [summary, setSummary] = useState<DashboardSummary>(initialSummary);
  const [detalhado, setDetalhado] = useState<DashboardRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [start, setStart] = useState<string | undefined>();
  const [end, setEnd] = useState<string | undefined>();
  const [marketplace, setMarketplace] = useState<string | undefined>();
  const [account, setAccount] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '1';
    }
    try {
      return localStorage.getItem(ACCOUNT_STORAGE_KEY) || '1';
    } catch {
      return '1';
    }
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(500);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);

  const initialFetchRef = useRef(false);
  const pendingAccountChangeRef = useRef(false);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const compareRefreshHandler = useRef<(() => void) | null>(null);

  const [view, setView] = useState<'dashboard' | 'compare'>('dashboard');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [comparePdfFileName, setComparePdfFileName] = useState('Comparativo_1x2_todos.pdf');
  const [curvaAbcConta, setCurvaAbcConta] = useState<'1' | '2'>('1');
  const [curvaAbcLoading, setCurvaAbcLoading] = useState(false);
  const [curvaAbcChanges, setCurvaAbcChanges] = useState<CurvaAbcMudanca[]>([]);
  const [curvaAbcError, setCurvaAbcError] = useState<string | null>(null);
  const [curvaAbcExpanded, setCurvaAbcExpanded] = useState(false);
  const [curvaAbcUpdatedAt, setCurvaAbcUpdatedAt] = useState<Date | null>(null);
  const [curvaAbcDismissedMap, setCurvaAbcDismissedMap] = useState<Record<string, boolean>>({});
  const [curvaAbcFilter, setCurvaAbcFilter] = useState<CurvaAbcFilter>('all');
  const [curvaAbcAckPending, setCurvaAbcAckPending] = useState<Record<string, boolean>>({});

  const loadCurvaAbcChanges = useCallback(
    async (contaOverride?: '1' | '2') => {
      const targetConta = contaOverride ?? curvaAbcConta;
      setCurvaAbcLoading(true);
      setCurvaAbcError(null);
      try {
        const mudancas = await getCurvaAbcMudancas(Number(targetConta));
        setCurvaAbcChanges(mudancas);
        setCurvaAbcUpdatedAt(new Date());
      } catch (err) {
        console.error('Erro ao verificar Curva ABC:', err);
        setCurvaAbcError(err instanceof Error ? err.message : 'Falha ao verificar Curva ABC');
      } finally {
        setCurvaAbcLoading(false);
      }
    },
    [curvaAbcConta]
  );

  const loadData = useCallback(
    async (requestedAccount: string) => {
      const activeAccount = requestedAccount || '1';
      setLoading(true);
      setError(null);
      try {
        if (activeAccount === '3') {
          setSummary(initialSummary);
          setDetalhado([]);
          setMonthly([]);
          setTotalLinhas(0);
          setLastUpdate(new Date());
          setLoading(false);
          return;
        }

        const sharedFilters = { start, end, marketplace };
        const detalhadoFilters = { ...sharedFilters, page, limit };
        const [summaryData, detalhadoResponse, monthlyResponse] = await Promise.all([
          getSummary(sharedFilters, activeAccount),
          getDetalhado(detalhadoFilters, activeAccount),
          getMonthly(sharedFilters, activeAccount),
        ]);

        const linhas = detalhadoResponse.linhas || [];
        setSummary(summaryData);
        setDetalhado(linhas);
        setTotalLinhas(detalhadoResponse.total ?? linhas.length);
        setMonthly(monthlyResponse);
        if (activeAccount !== '3') {
          loadCurvaAbcChanges();
        } else {
          setCurvaAbcChanges([]);
          setCurvaAbcUpdatedAt(null);
          setCurvaAbcExpanded(false);
          setCurvaAbcLoading(false);
          setCurvaAbcError(null);
        }
        setLastUpdate(new Date());
      } catch (err) {
        console.error('❌ Erro ao carregar dados do dashboard:', err);
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados');
      } finally {
        setLoading(false);
      }
    },
    [start, end, marketplace, page, limit, loadCurvaAbcChanges]
  );

  useEffect(() => {
    if (!initialFetchRef.current) {
      initialFetchRef.current = true;
      loadData(account);
      return;
    }

    if (pendingAccountChangeRef.current) {
      pendingAccountChangeRef.current = false;
      return;
    }

    const handle = setTimeout(() => {
      loadData(account);
    }, 400);

    return () => clearTimeout(handle);
  }, [account, loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, account);
    } catch {
      // ignore persistence errors
    }
  }, [account]);

  const aggregatedData = useMemo(() => aggregateByDate(detalhado), [detalhado]);

  const uniqueMarketplaces = useMemo(() => {
    const values = new Set<string>();
    detalhado.forEach((row) => {
      if (row.marketplace) {
        values.add(row.marketplace);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [detalhado]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (view !== 'dashboard' || account === '3') {
      return;
    }
    if (curvaAbcUpdatedAt || curvaAbcLoading) {
      return;
    }
    loadCurvaAbcChanges();
  }, [view, account, curvaAbcUpdatedAt, curvaAbcLoading, loadCurvaAbcChanges]);

  useEffect(() => {
    if (curvaAbcChanges.length === 0 && curvaAbcExpanded) {
      setCurvaAbcExpanded(false);
    }
  }, [curvaAbcChanges.length, curvaAbcExpanded]);

  const buildDashboardPdfFileName = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const startPart = start || today;
    const endPart = end && end !== start ? `_${end}` : '';
    const marketplaceLabel = selectedMarketplace || 'Todos';
    const marketplaceSlug = marketplaceLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'todos';
    return `Dashboard_${account}_${startPart}${endPart}_${marketplaceSlug}.pdf`;
  }, [account, start, end, selectedMarketplace]);

  const handleGeneratePdf = useCallback(async () => {
    const targetRef = view === 'compare' ? compareRef : dashboardRef;
    if (!targetRef.current) {
      setToast({ type: 'error', message: 'Não foi possível capturar a seção atual.' });
      return;
    }
    setIsGeneratingPdf(true);
    setToast(null);
    try {
      const canvas = await html2canvas(targetRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = view === 'compare' ? comparePdfFileName : buildDashboardPdfFileName();
      pdf.save(fileName);
      setToast({ type: 'success', message: `PDF gerado (${fileName})` });
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      setToast({ type: 'error', message: 'Falha ao gerar PDF. Tente novamente.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [view, comparePdfFileName, buildDashboardPdfFileName]);

  const kpis = useMemo(
    () => ({
      totalFaturamento: summary.faturamentoTotal,
      totalVendas: summary.vendasTotais,
      ticketMedio: summary.ticketMedio,
      totalVisitas: summary.visitas,
      taxaConversaoMedia: summary.taxaConversao,
      variacoes: {
        fat: summary.variacaoFatMedia,
        vendas: summary.variacaoVendasMedia,
        ticket: summary.variacaoTicketMedia,
        visitas: summary.variacaoVisitasMedia,
        conversao: summary.variacaoTxConversaoMedia,
      },
    }),
    [summary]
  );

  const salesChartData = useMemo(() => {
    if (selectedDate) {
      return aggregatedData.filter((row) => row.dateISO === selectedDate);
    }
    return aggregatedData.slice(-10);
  }, [aggregatedData, selectedDate]);

  const conversionChartData = useMemo(() => {
    if (selectedDate) {
      return aggregatedData.filter((row) => row.dateISO === selectedDate);
    }
    return aggregatedData.slice(-6);
  }, [aggregatedData, selectedDate]);

  const monthlyChartData = useMemo(() => {
    if (!monthly.length) {
      return [];
    }
    const sorted = [...monthly].sort((a, b) => a.mesISO.localeCompare(b.mesISO));
    if (start || end) {
      return sorted;
    }
    return sorted.slice(-6);
  }, [monthly, start, end]);

  const isDashboardView = view === 'dashboard';
  const headerTitle =
    view === 'compare'
      ? 'Comparativo de Contas'
      : account === '3'
        ? 'Dashboard VEIA'
        : 'Dashboard de Vendas';
  const canRefreshCompare = Boolean(compareRefreshHandler.current);
  const refreshButtonLabel = isDashboardView
    ? loading
      ? 'Carregando...'
      : 'Atualizar Dados'
    : canRefreshCompare
      ? 'Atualizar Comparativo'
      : 'Preparando comparativo...';
  const refreshDisabled =
    isGeneratingPdf || (isDashboardView ? loading : !canRefreshCompare);
  const refreshSpinning = isDashboardView ? loading : !canRefreshCompare && view === 'compare';
  const curvaAbcHasChanges = curvaAbcChanges.length > 0;
  const curvaAbcUpdatedLabel = curvaAbcUpdatedAt ? curvaAbcUpdatedAt.toLocaleString('pt-BR') : null;
  const curvaAbcDismissed = Boolean(curvaAbcDismissedMap[curvaAbcConta]);
  const filteredCurvaAbcChanges = useMemo(() => {
    if (curvaAbcFilter === 'all') {
      return curvaAbcChanges;
    }
    return curvaAbcChanges.filter((item) => {
      const trend = getCurvaAbcTrend(item.anterior, item.atual);
      return curvaAbcFilter === 'up' ? trend === 'up' : trend === 'down';
    });
  }, [curvaAbcChanges, curvaAbcFilter]);
  const getCurvaAbcTextClass = (item: CurvaAbcMudanca) => {
    const trend = getCurvaAbcTrend(item.anterior, item.atual);
    if (trend === 'up') {
      return 'bg-green-200 text-green-900 font-medium rounded-md text-center';
    }
    if (trend === 'down') {
      return 'bg-red-200 text-red-900 font-medium rounded-md text-center';
    }
    return 'text-emerald-700 font-semibold';
  };

  const handleReset = () => {
    setStart(undefined);
    setEnd(undefined);
    setMarketplace(undefined);
    setSelectedMarketplace(null);
    setSelectedDate(null);
    setPage(1);
    setLimit(500);
  };

  const handleClearSelectedDate = () => {
    setSelectedDate(null);
    setStart(undefined);
    setEnd(undefined);
    setPage(1);
  };

  const handleDateClick = (dateISO: string) => {
    if (selectedDate === dateISO) {
      handleClearSelectedDate();
      return;
    }
    setSelectedDate(dateISO);
    setStart(dateISO);
    setEnd(dateISO);
    setPage(1);
  };

  const handleMarketplaceChange = (value: string | null) => {
    setSelectedMarketplace(value);
    setMarketplace(value ? value.toLowerCase() : undefined);
    setPage(1);
  };

  const handleCurvaAbcRowAcknowledge = async (item: CurvaAbcMudanca) => {
    const codigo = (item.codigo || '').trim();
    const periodoAtual = (item.periodo_atual || '').trim();
    const marketplace = (item.marketplace || '').trim();
    if (!codigo || !periodoAtual) {
      setToast({ type: 'error', message: 'Não foi possível confirmar este item da Curva ABC.' });
      return;
    }
    const rowKey = getCurvaAbcRowKey(item);
    if (curvaAbcAckPending[rowKey]) {
      return;
    }
    setCurvaAbcAckPending((prev) => ({ ...prev, [rowKey]: true }));
    try {
      await acknowledgeCurvaAbcChange({
        conta: curvaAbcConta,
        codigo,
        periodoAtual,
        curva: item.atual || null,
        marketplace: marketplace || null,
      });
      setCurvaAbcChanges((prev) =>
        prev.filter((change) => {
          const sameCodigo = change.codigo === codigo;
          const samePeriodo = change.periodo_atual === periodoAtual;
          const sameMarketplace = (change.marketplace || '').trim() === marketplace;
          return !(sameCodigo && samePeriodo && sameMarketplace);
        })
      );
    } catch (error) {
      console.error('Erro ao confirmar mudança da Curva ABC:', error);
      setToast({ type: 'error', message: 'Falha ao registrar confirmação da Curva ABC. Tente novamente.' });
    } finally {
      setCurvaAbcAckPending((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    }
  };

  const handleCurvaAbcAcknowledge = async () => {
    if (curvaAbcChanges.length) {
      const pendingItems = [...curvaAbcChanges];
      await Promise.all(pendingItems.map((item) => handleCurvaAbcRowAcknowledge(item)));
    }
    setCurvaAbcDismissedMap((prev) => ({ ...prev, [curvaAbcConta]: true }));
    setCurvaAbcExpanded(false);
  };

  const handleCurvaAbcContaChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value === '2' ? '2' : '1';
    setCurvaAbcConta(value);
    setCurvaAbcExpanded(false);
    setCurvaAbcUpdatedAt(null);
    loadCurvaAbcChanges(value);
  };

  const handleAccountChange = (value: string) => {
    if (value === account) {
      return;
    }
    pendingAccountChangeRef.current = true;
    setView('dashboard');
    setAccount(value);
    loadData(value);
  };

  const handleGlobalRefresh = () => {
    if (view === 'compare') {
      compareRefreshHandler.current?.();
      return;
    }
    loadData(account);
  };

  if (loading && !detalhado.length && !lastUpdate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg border shadow-sm text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.message}
        </div>
      )}
      <div
        ref={dashboardRef}
        id="dashboard-root"
        className="max-w-[1800px] mx-auto p-6 space-y-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              {headerTitle}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              {isDashboardView ? (
                <>
                  <p className="text-gray-600">
                    Última atualização: {lastUpdate ? lastUpdate.toLocaleString('pt-BR') : '—'}
                  </p>
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-green-700">
                      Conectado à planilha
                    </span>
                  </div>
                  {account !== '3' && (
                    <div className="px-3 py-1 bg-blue-50 rounded-full border border-blue-200">
                      <span className="text-xs font-medium text-blue-700">
                        {aggregatedData.length} de {totalLinhas} registros
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-gray-600">
                    Compare métricas lado a lado aplicando filtros independentes.
                  </p>
                  <div className="px-3 py-1 bg-purple-50 rounded-full border border-purple-200">
                    <span className="text-xs font-medium text-purple-700">Modo comparativo ativo</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={handleGlobalRefresh}
              disabled={refreshDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                isDashboardView ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${refreshSpinning ? 'animate-spin' : ''}`} />
              {refreshButtonLabel}
            </button>
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className={`w-4 h-4 ${isGeneratingPdf ? 'animate-spin' : ''}`} />
              {isGeneratingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-200"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          <aside className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-5 lg:sticky lg:top-6 h-fit">
            <div>
              <p className="text-sm font-semibold text-gray-800">Conta</p>
              <p className="text-xs text-gray-500">Escolha qual planilha carregar</p>
            </div>
            <div className="flex flex-col gap-2">
              {ACCOUNT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={account === value}
                  onClick={() => handleAccountChange(value)}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                    account === value
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-100">
              <button
                type="button"
                aria-pressed={view === 'compare'}
                onClick={() => setView((prev) => (prev === 'compare' ? 'dashboard' : 'compare'))}
                className={`w-full px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  view === 'compare'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                    : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                }`}
              >
                Comparativo
              </button>
            </div>
            {account !== '3' && isDashboardView && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Marketplace</p>
                  <p className="text-xs text-gray-500">Filtre por marketplace (opcional)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleMarketplaceChange(null)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      selectedMarketplace === null
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Todos
                  </button>
                  {uniqueMarketplaces.map((marketplaceOption) => (
                    <button
                      key={marketplaceOption}
                      type="button"
                      onClick={() => handleMarketplaceChange(marketplaceOption)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                        selectedMarketplace === marketplaceOption
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {marketplaceOption}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section className="space-y-6">
            {view === 'compare' ? (
              <CompareView
                ref={compareRef}
                marketplaceOptions={uniqueMarketplaces}
                onPdfInfoChange={({ fileName }) => setComparePdfFileName(fileName)}
                onRegisterRefresh={(handler) => {
                  compareRefreshHandler.current = handler;
                }}
              />
            ) : account === '3' ? (
              <VeiaDashboard />
            ) : (
              <>
                <DateFilter
                  startDate={start ?? ''}
                  endDate={end ?? ''}
                  onStartDateChange={(value) => {
                    setStart(value || undefined);
                    setSelectedDate(null);
                    setPage(1);
                  }}
                  onEndDateChange={(value) => {
                    setEnd(value || undefined);
                    setSelectedDate(null);
                    setPage(1);
                  }}
                  onReset={handleReset}
                />

                {(selectedDate || selectedMarketplace) && (
                  <div className="flex flex-wrap gap-3">
                    {selectedDate && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 flex items-center justify-between flex-1 min-w-[300px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          <span className="text-sm font-medium text-blue-900">
                            Filtro de dia ativo: {formatDateBR(selectedDate)}
                          </span>
                        </div>
                        <button
                          onClick={handleClearSelectedDate}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium border border-blue-200"
                        >
                          <X className="w-4 h-4" />
                          Limpar
                        </button>
                      </div>
                    )}
                    {selectedMarketplace && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200 flex items-center justify-between flex-1 min-w-[300px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                          <span className="text-sm font-medium text-green-900">
                            Marketplace ativo: {selectedMarketplace}
                          </span>
                        </div>
                        <button
                          onClick={() => handleMarketplaceChange(null)}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium border border-green-200"
                        >
                          <X className="w-4 h-4" />
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <KPICard
                    title="Faturamento Total"
                    value={currencyBRL(kpis.totalFaturamento)}
                    icon={DollarSign}
                    variationLabel="Variação média do período"
                    variationValue={kpis.variacoes.fat}
                    iconColor="text-green-600"
                    iconBgColor="bg-green-50"
                  />
                  <KPICard
                    title="Total de Vendas"
                    value={numBR(kpis.totalVendas)}
                    icon={ShoppingBag}
                    variationLabel="Variação média do período"
                    variationValue={kpis.variacoes.vendas}
                    iconColor="text-blue-600"
                    iconBgColor="bg-blue-50"
                  />
                  <KPICard
                    title="Ticket Médio"
                    value={currencyBRL(kpis.ticketMedio)}
                    icon={TrendingUp}
                    variationLabel="Variação média do período"
                    variationValue={kpis.variacoes.ticket}
                    iconColor="text-orange-600"
                    iconBgColor="bg-orange-50"
                  />
                  <KPICard
                    title="Total de Visitas"
                    value={numBR(kpis.totalVisitas)}
                    icon={Users}
                    variationLabel="Variação média do período"
                    variationValue={kpis.variacoes.visitas}
                    iconColor="text-purple-600"
                    iconBgColor="bg-purple-50"
                  />
                  <KPICard
                    title="Taxa de Conversão"
                    value={percentBR(kpis.taxaConversaoMedia)}
                    icon={Percent}
                    variationLabel="Variação média do período"
                    variationValue={kpis.variacoes.conversao}
                    iconColor="text-pink-600"
                    iconBgColor="bg-pink-50"
                  />
                </div>

                {isDashboardView && account !== '3' && !curvaAbcDismissed && (
                  <div className="grid grid-cols-1">
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                      <div className="mb-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:flex-row sm:items-center sm:justify-end">
                        <label htmlFor="curva-abc-conta" className="text-slate-500">
                          Conta
                        </label>
                        <select
                          id="curva-abc-conta"
                          value={curvaAbcConta}
                          onChange={handleCurvaAbcContaChange}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium capitalize text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-auto"
                        >
                          <option value="1">Conta 1</option>
                          <option value="2">Conta 2</option>
                        </select>
                      </div>
                      {curvaAbcLoading ? (
                        <div className="space-y-4">
                          <div className="h-4 w-1/3 rounded-full bg-slate-100 animate-pulse" />
                          <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                        </div>
                      ) : curvaAbcError ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          <AlertTriangle className="h-5 w-5" />
                          <div>
                            <p className="font-semibold">Erro ao verificar Curva ABC</p>
                            <p>{curvaAbcError}</p>
                          </div>
                        </div>
                      ) : curvaAbcHasChanges ? (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-1 items-start gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                                <AlertTriangle className="h-6 w-6" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
                                  Curva ABC – Alterações Detectadas
                                </p>
                                <p className="text-base text-slate-600">
                                  {curvaAbcChanges.length === 1
                                    ? '1 mudança identificada'
                                    : `${curvaAbcChanges.length} mudanças identificadas`}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                              {curvaAbcHasChanges && (
                                <button
                                  type="button"
                                  onClick={handleCurvaAbcAcknowledge}
                                  className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  Estou ciente
                                </button>
                              )}
                              <button
                                type="button"
                                aria-expanded={curvaAbcExpanded}
                                onClick={() => setCurvaAbcExpanded((prev) => !prev)}
                                className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                              >
                                {curvaAbcExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                              </button>
                            </div>
                          </div>
                          {curvaAbcExpanded && (
                            <div className="mt-5">
                              <div className="mb-4 flex flex-wrap items-center gap-2">
                                {CURVA_ABC_FILTER_OPTIONS.map(({ value, label }) => {
                                  const isActive = curvaAbcFilter === value;
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => setCurvaAbcFilter(value)}
                                      className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                                        isActive
                                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <tr>
                                      <th className="px-4 py-3 text-left">Código Anúncio</th>
                                      <th className="px-4 py-3 text-left">Curva Anterior</th>
                                      <th className="px-4 py-3 text-left">Curva Atual</th>
                                      <th className="px-4 py-3 text-left">Período Atual</th>
                                      <th className="px-4 py-3 text-left">Marketplace</th>
                                      <th className="px-4 py-3 text-left">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                                    {filteredCurvaAbcChanges.map((item) => {
                                      const rowKey = getCurvaAbcRowKey(item);
                                      const isAcknowledging = Boolean(curvaAbcAckPending[rowKey]);
                                      return (
                                        <tr key={rowKey}>
                                          <td className="px-4 py-3 font-semibold text-slate-900">{item.codigo || '—'}</td>
                                          <td className="px-4 py-3">{item.anterior || '—'}</td>
                                          <td className={`px-4 py-3 ${getCurvaAbcTextClass(item)}`}>
                                            {item.atual || '—'}
                                          </td>
                                          <td className="px-4 py-3">{item.periodo_atual || '—'}</td>
                                          <td className="px-4 py-3">{item.marketplace || '—'}</td>
                                          <td className="px-4 py-3">
                                            <button
                                              type="button"
                                              onClick={() => handleCurvaAbcRowAcknowledge(item)}
                                              disabled={isAcknowledging}
                                              className="px-2 py-1 text-xs rounded bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                              Estou ciente
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            <CheckCircle2 className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">
                              Curva ABC – Alterações Recentes
                            </p>
                            <p className="text-base text-slate-600">
                              ✅ Nenhuma alteração na Curva ABC desde a última atualização.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 text-right text-xs font-medium text-slate-400">
                        {curvaAbcUpdatedLabel ? `Atualizado em ${curvaAbcUpdatedLabel}` : 'Atualização pendente'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SalesChart
                    data={salesChartData}
                    title={
                      selectedDate
                        ? `Dados do dia ${formatDateBR(selectedDate)}`
                        : 'Evolução de Faturamento e Vendas (Últimos 10 Dias)'
                    }
                    onDateClick={handleDateClick}
                    selectedDate={selectedDate}
                  />
                  <ConversionChart
                    data={conversionChartData}
                    onDateClick={handleDateClick}
                    selectedDate={selectedDate}
                  />
                </div>

                <div className="grid grid-cols-1">
                  <MonthlyComparisonChart data={monthlyChartData} isLoading={loading} />
                </div>

                {aggregatedData.length === 0 && (
                  <div className="bg-white rounded-lg shadow-sm p-12 text-center border border-gray-100">
                    <p className="text-gray-500">Nenhum dado encontrado para o período selecionado.</p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
