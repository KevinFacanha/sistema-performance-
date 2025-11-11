import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ComparativoMensalItem } from '../lib/api';
import { currencyBRL, formatDateBR, formatNumber } from '../lib/format';

interface CompareMonthlyChartProps {
  data: ComparativoMensalItem[];
  loading?: boolean;
  contaALabel: string;
  contaBLabel: string;
}

interface ChartDataset {
  mesAno: string;
  contaA: number;
  contaB: number;
}

const BLUE = '#2563eb';
const GREEN = '#16a34a';

function formatMesLabel(mesAno: string) {
  return formatDateBR(mesAno, 'MMM/yy');
}

function ChartSection({
  title,
  data,
  valueFormatter,
  yAxisFormatter,
}: {
  title: string;
  data: ChartDataset[];
  valueFormatter: (value: number) => string;
  yAxisFormatter: (value: number) => string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">
        Sem dados suficientes
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 4 }} barCategoryGap={24}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="mesAno"
              tickFormatter={(value) => formatMesLabel(String(value))}
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              tickFormatter={(value) => yAxisFormatter(Number(value))}
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.12)' }}
              formatter={(value: any) => valueFormatter(Number(value))}
              labelFormatter={(label) => formatMesLabel(String(label))}
            />
            <Bar
              dataKey="contaA"
              name="Conta A"
              fill={BLUE}
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="contaB"
              name="Conta B"
              fill={GREEN}
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CompareMonthlyChart({
  data,
  loading = false,
  contaALabel,
  contaBLabel,
}: CompareMonthlyChartProps) {
  const fatData: ChartDataset[] = data.map((item) => ({
    mesAno: item.mesAno,
    contaA: item.A.fat,
    contaB: item.B.fat,
  }));

  const vendasData: ChartDataset[] = data.map((item) => ({
    mesAno: item.mesAno,
    contaA: item.A.vendas,
    contaB: item.B.vendas,
  }));

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-gray-900">Comparativo Mensal</p>
        <p className="text-sm text-gray-500">Faturamento e Vendas por mês (Conta A vs Conta B)</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-gray-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BLUE }} />
          {contaALabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GREEN }} />
          {contaBLabel}
        </span>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <div className="h-4 w-1/3 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-[260px] rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-4 w-1/4 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-[260px] rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : data.length === 0 ? (
        <div className="mt-8 flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">
          Nenhum dado encontrado para o período selecionado.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <ChartSection
            title="Faturamento (R$)"
            data={fatData}
            valueFormatter={(value) => currencyBRL(value)}
            yAxisFormatter={(value) => currencyBRL(value).replace('R$', '').trim()}
          />
          <ChartSection
            title="Vendas (Qtd)"
            data={vendasData}
            valueFormatter={(value) => formatNumber(value)}
            yAxisFormatter={(value) => formatNumber(value, { compact: true })}
          />
        </div>
      )}
    </div>
  );
}
