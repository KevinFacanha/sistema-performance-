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
  const shareAPercent = Math.min(100, Math.max(0, Math.round(shareA * 100)));
  let shareBPercent = Math.min(100, Math.max(0, Math.round(shareB * 100)));
  if (shareAPercent + shareBPercent !== 100) {
    shareBPercent = Math.max(0, Math.min(100, 100 - shareAPercent));
  }
  const leadingLabel = leading === 'A' ? contaALabel : leading === 'B' ? contaBLabel : null;
  const formattedValueA = formatValue(valueA, format);
  const formattedValueB = formatValue(valueB, format);

  const getValueSizeClass = (valueText: string) => {
    const length = valueText.length;
    if (length > 20) return 'text-lg';
    if (length > 16) return 'text-xl';
    if (length > 12) return 'text-2xl';
    return 'text-3xl';
  };

  const renderAccountBlock = (
    type: 'A' | 'B',
    valueText: string,
    sharePercent: number,
    labelText: string,
    valueSizeClass: string
  ) => {
    const isContaA = type === 'A';
    const isLeading = leading === type;
    const highlightClasses = isContaA
      ? 'border-blue-200 bg-blue-50/80 shadow-sm'
      : 'border-emerald-200 bg-emerald-50/80 shadow-sm';
    const defaultClasses = 'border-slate-100 bg-slate-50';
    const labelColor = isContaA ? 'text-blue-700' : 'text-emerald-700';
    const valueColor = isContaA ? 'text-blue-900' : 'text-emerald-900';
    const shareColor = isContaA ? 'text-blue-600' : 'text-emerald-600';
    const badgeColor = isContaA ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';

    return (
      <div
        className={`rounded-2xl border px-4 py-4 transition ${isLeading ? highlightClasses : defaultClasses}`}
      >
        <div className="flex items-center gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>{labelText}</p>
          {isLeading && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
              A frente
            </span>
          )}
        </div>
        <p
          className={`${valueSizeClass} mt-3 font-bold leading-tight ${valueColor} tabular-nums whitespace-nowrap`}
        >
          {valueText}
        </p>
        <p className={`mt-2 text-xs font-semibold ${shareColor}`}>Participacao {sharePercent}%</p>
      </div>
    );
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Comparativo
          </p>
          <p className="text-lg font-semibold text-slate-900">{label}</p>
        </div>
        <div
          className={`inline-flex flex-col items-end rounded-2xl border px-3 py-2 text-right ${deltaClasses(
            delta
          )}`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide">Diferenca</span>
          <div className="mt-1 flex items-center gap-1 text-sm font-semibold">
            <DeltaIcon delta={delta} />
            <span className="whitespace-nowrap tabular-nums">
              {formatDelta(delta, format)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {renderAccountBlock('A', formattedValueA, shareAPercent, contaALabel, getValueSizeClass(formattedValueA))}
        {renderAccountBlock('B', formattedValueB, shareBPercent, contaBLabel, getValueSizeClass(formattedValueB))}
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>
            {contaALabel}: {shareAPercent}%
          </span>
          <span>
            {contaBLabel}: {shareBPercent}%
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${shareAPercent}%` }}
          />
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${shareBPercent}%` }}
          />
        </div>
        <p className="text-xs font-semibold text-slate-600">
          {leading === 'tie'
            ? 'As contas estao empatadas.'
            : `${leadingLabel} lidera por ${formatValue(Math.abs(delta), format)}`}
        </p>
      </div>
    </div>
  );
}
