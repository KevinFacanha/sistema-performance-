import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { currencyBRL, formatDateBR } from '../lib/format';

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

function formatMes(mesAno: string) {
  if (!mesAno) return '';
  return formatDateBR(mesAno, 'MMM/yy');
}

function SkeletonCard() {
  return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
}

const tooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const vendas1 = payload.find((item: any) => item.dataKey === 'vendasBrutas1');
  const vendas2 = payload.find((item: any) => item.dataKey === 'vendasBrutas2');
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{formatMes(String(label ?? ''))}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-center justify-between gap-8">
          <span className="text-slate-500">Vendas Brutas 1</span>
          <span className="font-semibold text-slate-900">{currencyBRL(Number(vendas1?.value || 0))}</span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <span className="text-slate-500">Vendas Brutas 2</span>
          <span className="font-semibold text-slate-900">{currencyBRL(Number(vendas2?.value || 0))}</span>
        </div>
      </div>
    </div>
  );
};

export function VeiaDashboard() {
  const [summary, setSummary] = useState<VeiaSummary>(initialVeiaSummary);
  const [mensal, setMensal] = useState<VeiaMonthlyPoint[]>([]);
  const [modalidade, setModalidade] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [periodo, setPeriodo] = useState<string>('');
  const [modalidadeOptions, setModalidadeOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [periodoOptions, setPeriodoOptions] = useState<VeiaPeriodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        modalidade: modalidade || undefined,
        status: status || undefined,
        periodo: periodo || undefined,
      };
      const [summaryData, mensalResponse] = await Promise.all([
        getVeiaSummary(filters),
        getVeiaMensal(filters),
      ]);
      setSummary(summaryData);
      setMensal(mensalResponse.meses);
      setModalidadeOptions(mensalResponse.modalidades || []);
      setStatusOptions(mensalResponse.status || []);
    } catch (err) {
      console.error('Erro ao carregar dados VEIA:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados VEIA');
    } finally {
      setLoading(false);
    }
  }, [modalidade, status, periodo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const cards = useMemo(() => {
    return [
      { label: 'Vendas Brutas (1)', value: summary.vendasBrutas1Total },
      { label: 'Vendas Brutas (2)', value: summary.vendasBrutas2Total },
      { label: 'Reembolsos C1', value: summary.reembolsoC1Total },
      { label: 'Reembolsos C2', value: summary.reembolsoC2Total },
      { label: 'Custos Devolução C1', value: summary.custoDevC1Total },
      { label: 'Custos Devolução C2', value: summary.custoDevC2Total },
    ];
  }, [summary]);

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
        <div className="flex flex-1 min-w-[160px] flex-col">
          <label className="text-sm font-semibold text-gray-700">Status</label>
          <select
            className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
                <p className="mt-2 text-xl font-semibold text-gray-900">{currencyBRL(card.value)}</p>
              </div>
            ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="space-y-4">
            <div className="h-6 w-1/3 rounded-full bg-slate-100" />
            <div className="h-[280px] rounded-2xl bg-slate-100" />
          </div>
        ) : mensal.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
            Nenhum dado encontrado para os filtros selecionados.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={mensal} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
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
              <Tooltip content={tooltipContent} />
              <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 12 }} />
              <Bar dataKey="vendasBrutas1" name="Vendas Brutas 1" fill="#2563eb" radius={[8, 8, 0, 0]} />
              <Bar dataKey="vendasBrutas2" name="Vendas Brutas 2" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
