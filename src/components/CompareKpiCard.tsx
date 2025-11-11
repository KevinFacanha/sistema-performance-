import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { currencyBRL, numBR, percentBR } from '../lib/format';

type ValueFormat = 'currency' | 'number' | 'percent';

interface CompareKpiCardProps {
  label: string;
  valueA: number;
  valueB: number;
  delta: number;
  contaALabel: string;
  contaBLabel: string;
  format?: ValueFormat;
}

function formatValue(value: number, format: ValueFormat) {
  if (format === 'currency') return currencyBRL(value);
  if (format === 'percent') return percentBR(value);
  return numBR(value);
}

function formatDelta(delta: number, format: ValueFormat) {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const absolute = Math.abs(delta);
  const formatted = formatValue(absolute, format);
  return `${sign}${formatted}`;
}

function deltaClasses(delta: number) {
  if (delta > 0) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (delta < 0) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (delta < 0) return <ArrowDownRight className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function getShare(valueA: number, valueB: number) {
  const total = Math.abs(valueA) + Math.abs(valueB);
  if (total === 0) {
    return { shareA: 0.5, shareB: 0.5 };
  }
  const shareA = Math.abs(valueA) / total;
  return { shareA, shareB: 1 - shareA };
}

export function CompareKpiCard({
  label,
  valueA,
  valueB,
  delta,
  contaALabel,
  contaBLabel,
  format = 'currency',
}: CompareKpiCardProps) {
  const leading = valueA === valueB ? 'tie' : valueA > valueB ? 'A' : 'B';
  const { shareA, shareB } = getShare(valueA, valueB);
  const shareAPercent = Math.round(shareA * 100);
  const shareBPercent = 100 - shareAPercent;
  const gradientBackground = `linear-gradient(90deg, #2563eb ${shareAPercent}%, #22c55e ${shareAPercent}%)`;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Comparativo
          </p>
          <p className="text-lg font-semibold text-slate-900">{label}</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${deltaClasses(delta)}`}
        >
          <DeltaIcon delta={delta} />
          <span>Δ {formatDelta(delta, format)}</span>
        </span>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className={`flex min-w-0 flex-col items-center rounded-2xl border px-3 py-4 text-center transition ${
            leading === 'A'
              ? 'border-blue-200 bg-blue-50/80 shadow-sm'
              : 'border-slate-100 bg-slate-50'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{contaALabel}</p>
          <p className="mt-2 w-full text-2xl font-bold leading-tight text-blue-900 break-words">
            {formatValue(valueA, format)}
          </p>
          {leading === 'A' && (
            <p className="mt-1 text-[11px] font-semibold text-blue-600">À frente</p>
          )}
        </div>
        <div
          className={`flex min-w-0 flex-col items-center rounded-2xl border px-3 py-4 text-center transition ${
            leading === 'B'
              ? 'border-emerald-200 bg-emerald-50/80 shadow-sm'
              : 'border-slate-100 bg-slate-50'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{contaBLabel}</p>
          <p className="mt-2 w-full text-2xl font-bold leading-tight text-emerald-900 break-words">
            {formatValue(valueB, format)}
          </p>
          {leading === 'B' && (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600">À frente</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>
            {contaALabel}: {shareAPercent}%
          </span>
          <span>
            {contaBLabel}: {shareBPercent}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: '100%',
              background: gradientBackground,
            }}
          />
        </div>
        {leading === 'tie' ? (
          <p className="text-xs font-semibold text-slate-500">
            Empate técnico entre as contas
          </p>
        ) : (
          <p className="text-xs font-semibold text-slate-600">
            {leading === 'A' ? contaALabel : contaBLabel} lidera por {formatValue(Math.abs(delta), format)}
          </p>
        )}
      </div>
    </div>
  );
}
