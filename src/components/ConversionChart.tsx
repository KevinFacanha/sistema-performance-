import { Users, ShoppingCart, Percent } from 'lucide-react';
import { DashboardRow } from '../lib/api';
import { formatDateBR, formatPercentSignedBR } from '../lib/format';

interface ConversionChartProps {
  data: DashboardRow[];
  onDateClick?: (dateISO: string) => void;
  selectedDate?: string | null;
}

const VARIATION_FIELDS: Array<{ key: keyof DashboardRow; label: string }> = [
  { key: 'variacaoFat', label: 'Variação FAT' },
  { key: 'variacaoVendas', label: 'Variação Vendas' },
  { key: 'variacaoTicket', label: 'Variação Ticket' },
  { key: 'variacaoVisitas', label: 'Variação Visitas' },
  { key: 'variacaoTxConversao', label: 'Variação Tx Conv.' },
];

function getVariationColor(value?: number | null) {
  if (value === null || value === undefined) return 'text-gray-500';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-gray-500';
}

function VariationDetails({ row }: { row: DashboardRow }) {
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
      {VARIATION_FIELDS.map(({ key, label }) => {
        const value = row[key] as number | null | undefined;
        return (
          <span key={label} className={getVariationColor(value)}>
            {label}: {formatPercentSignedBR(value)}
          </span>
        );
      })}
    </div>
  );
}

function buildTooltip(row: DashboardRow) {
  return VARIATION_FIELDS.map(({ key, label }) => {
    const value = row[key] as number | null | undefined;
    return `${label}: ${formatPercentSignedBR(value)}`;
  }).join(' | ');
}

export function ConversionChart({ data, onDateClick, selectedDate }: ConversionChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Análise de Conversão</h3>
        <p className="text-gray-500 text-center py-8">Nenhum dado disponível</p>
      </div>
    );
  }

  const maxVisitas = Math.max(1, ...data.map(d => d.visitas));
  const maxConversao = Math.max(1, ...data.map(d => d.taxaConversao));

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-6">Análise de Conversão</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Visitas por Dia</span>
          </div>
          <div className="space-y-3">
            {data.map((item, index) => {
              const label = formatDateBR(item.dateISO);
              const isSelected = selectedDate === item.dateISO;
              const visitasPercent = Math.min(100, (item.visitas / maxVisitas) * 100);
              const tooltip = buildTooltip(item);
              return (
              <div
                key={index}
                className={`rounded-lg transition-all ${
                  onDateClick ? 'cursor-pointer hover:bg-purple-50 p-2 -m-2' : ''
                } ${
                  isSelected ? 'bg-purple-100 ring-2 ring-purple-500' : ''
                }`}
                onClick={() => onDateClick?.(item.dateISO)}
                title={tooltip || undefined}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-xs font-medium text-gray-700">{item.visitas}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${visitasPercent}%` }}
                  ></div>
                </div>
                <VariationDetails row={item} />
              </div>
            )})}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">Taxa de Conversão</span>
          </div>
          <div className="space-y-3">
            {data.map((item, index) => {
              const label = formatDateBR(item.dateISO);
              const isSelected = selectedDate === item.dateISO;
              const conversaoPercent = Math.min(100, (item.taxaConversao / maxConversao) * 100);
              const tooltip = buildTooltip(item);
              return (
              <div
                key={index}
                className={`rounded-lg transition-all ${
                  onDateClick ? 'cursor-pointer hover:bg-orange-50 p-2 -m-2' : ''
                } ${
                  isSelected ? 'bg-orange-100 ring-2 ring-orange-500' : ''
                }`}
                onClick={() => onDateClick?.(item.dateISO)}
                title={tooltip || undefined}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-xs font-medium text-gray-700">{item.taxaConversao.toFixed(2)}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-orange-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${conversaoPercent}%` }}
                  ></div>
                </div>
                <VariationDetails row={item} />
              </div>
            )})}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="grid grid-cols-3 gap-4">
          {data.map((item, index) => {
            const label = formatDateBR(item.dateISO);
            const isSelected = selectedDate === item.dateISO;
            const tooltip = buildTooltip(item);
            return (
            <div
              key={index}
              className={`bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border transition-all ${
                onDateClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-md' : ''
              } ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-500 shadow-lg' : 'border-gray-100'
              }`}
              onClick={() => onDateClick?.(item.dateISO)}
              title={tooltip || undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-gray-600">{label}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Visitas:</span>
                  <span className="font-medium text-gray-700">{item.visitas}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Vendas:</span>
                  <span className="font-medium text-gray-700">{item.vendas}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200">
                  <span className="text-gray-500">Conversão:</span>
                  <span className="font-semibold text-blue-600">{item.taxaConversao.toFixed(2)}%</span>
                </div>
                <VariationDetails row={item} />
              </div>
            </div>
          )})}
        </div>
      </div>
    </div>
  );
}
