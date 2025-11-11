import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LegendProps, TooltipContentProps } from 'recharts';
import { MonthlyPoint } from '../lib/api';
import { formatCurrencyBR, formatDateBR, formatNumber } from '../lib/format';

interface MonthlyComparisonChartProps {
  data: MonthlyPoint[];
  isLoading?: boolean;
}

const LEGEND_ITEMS = [
  { key: 'faturamento', label: 'Faturamento (R$)', color: '#2563eb' },
  { key: 'vendas', label: 'Vendas (Qtd)', color: '#10b981' },
];

function formatMonthLabel(mesISO: string) {
  if (!mesISO) return '';
  return formatDateBR(mesISO, 'MMM/yy');
}

const LegendContent = ({ className }: LegendProps) => (
  <div
    role="list"
    aria-label="Legenda do comparativo mensal"
    className={`flex flex-wrap gap-3 ${className ?? ''}`.trim()}
  >
    {LEGEND_ITEMS.map((item) => (
      <span
        key={item.key}
        role="listitem"
        aria-label={item.label}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
        {item.label}
      </span>
    ))}
  </div>
);

const MonthlyTooltip = ({ active, payload, label }: TooltipContentProps<number, string>) => {
  if (!active || !payload || payload.length === 0) return null;

  const faturamento = payload.find((item) => item.dataKey === 'faturamento');
  const vendas = payload.find((item) => item.dataKey === 'vendas');

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">
        {formatMonthLabel(String(label ?? ''))}
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
            Faturamento
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {formatCurrencyBR(Number(faturamento?.value || 0))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
            Vendas
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {formatNumber(Number(vendas?.value || 0))}
          </span>
        </div>
      </div>
    </div>
  );
};

function SkeletonPlaceholder() {
  return (
    <div className="flex h-[300px] flex-col justify-center gap-4">
      <div className="h-4 w-1/3 rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="h-[220px] rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800" />
    </div>
  );
}

export function MonthlyComparisonChart({ data, isLoading = false }: MonthlyComparisonChartProps) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const target = document.documentElement;
    const update = () => setIsDarkMode(target.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => data ?? [], [data]);
  const showLabels = chartData.length > 0 && chartData.length <= 6;
  const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#94a3b8' : '#e2e8f0';

  const renderTooltip = (props: TooltipContentProps<number, string>) => (
    <MonthlyTooltip {...props} />
  );

  return (
    <div
      className="h-full min-h-[360px] rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      aria-label="Gráfico comparativo mensal de faturamento e vendas"
    >
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-base font-semibold text-slate-900 dark:text-white">Comparativo Mensal</p>
        <p className="text-sm text-slate-500 dark:text-slate-300">
          Faturamento x Vendas (últimos meses)
        </p>
      </div>

      {isLoading ? (
        <SkeletonPlaceholder />
      ) : chartData.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm font-medium text-slate-500 dark:border-slate-700 dark:text-slate-300">
          Sem dados para o período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={chartData}
            margin={{ top: 32, right: 24, left: 0, bottom: 8 }}
            barCategoryGap={28}
            barGap={8}
          >
            <defs>
              <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
              <linearGradient id="gradQtd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis
              dataKey="mesISO"
              tickFormatter={(value) => formatMonthLabel(String(value))}
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={{ stroke: gridColor }}
              tickLine={{ stroke: gridColor }}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => formatCurrencyBR(Number(value), { compact: true })}
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={{ stroke: gridColor }}
              tickLine={{ stroke: gridColor }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(value) => formatNumber(Number(value))}
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={{ stroke: gridColor }}
              tickLine={{ stroke: gridColor }}
            />
            <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
            <Legend
              verticalAlign="top"
              align="left"
              wrapperStyle={{ paddingBottom: 8 }}
              content={<LegendContent />}
            />
            <Bar
              yAxisId="left"
              dataKey="faturamento"
              name="Faturamento (R$)"
              fill="url(#gradFat)"
              radius={[8, 8, 0, 0]}
              maxBarSize={38}
            >
              {showLabels && (
                <LabelList
                  dataKey="faturamento"
                  position="top"
                  fill={axisColor}
                  fontSize={12}
                  formatter={(value: any) => formatCurrencyBR(Number(value), { compact: true })}
                />
              )}
            </Bar>
            <Bar
              yAxisId="right"
              dataKey="vendas"
              name="Vendas (Qtd)"
              fill="url(#gradQtd)"
              radius={[8, 8, 0, 0]}
              maxBarSize={38}
            >
              {showLabels && (
                <LabelList
                  dataKey="vendas"
                  position="top"
                  fill={axisColor}
                  fontSize={12}
                  formatter={(value: any) => formatNumber(Number(value))}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
