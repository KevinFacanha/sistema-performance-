import { LucideIcon } from 'lucide-react';
import { formatPercentSignedBR } from '../lib/format';

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variationLabel?: string;
  variationValue?: number | null;
  iconColor?: string;
  iconBgColor?: string;
}

function getVariationColor(value?: number | null) {
  if (value === null || value === undefined) return 'text-gray-500';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-gray-500';
}

export function KPICard({
  title,
  value,
  icon: Icon,
  variationLabel,
  variationValue,
  iconColor = 'text-blue-600',
  iconBgColor = 'bg-blue-50',
}: KPICardProps) {
  const variationColor = getVariationColor(variationValue);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
          {variationLabel && (
            <p className={`text-sm font-medium mt-2 ${variationColor}`}>
              {variationLabel}: {formatPercentSignedBR(variationValue)}
            </p>
          )}
        </div>

        <div className={`${iconBgColor} p-3 rounded-lg`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}
