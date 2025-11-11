const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyCompactFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const numberCompactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface FormatOptions {
  compact?: boolean;
}

export function formatCurrencyBR(value: number, options: FormatOptions = {}): string {
  const parsed = Number(value || 0);
  if (options.compact) {
    return currencyCompactFormatter.format(parsed);
  }
  return currencyFormatter.format(parsed);
}

export function currencyBRL(value: number): string {
  return formatCurrencyBR(value);
}

export function percentBR(value: number, casas = 2): string {
  const num = Number.isFinite(value) ? value : 0;
  const formatted = num.toFixed(casas).replace('.', ',');
  return `${formatted}%`;
}

export function formatNumber(value: number, options: FormatOptions = {}): string {
  const parsed = Number(value || 0);
  if (options.compact) {
    return numberCompactFormatter.format(parsed);
  }
  return numberFormatter.format(parsed);
}

export function numBR(value: number): string {
  return formatNumber(value);
}

export function formatDateBR(dateISO?: string, pattern: 'dd/MM/yyyy' | 'MMM/yy' = 'dd/MM/yyyy'): string {
  if (!dateISO) return '';
  const normalized = dateISO.length === 7 ? `${dateISO}-01` : dateISO;
  const [year, month, day] = normalized.split('-');
  if (!year || !month) return dateISO;

  if (pattern === 'MMM/yy') {
    const monthIndex = Number.parseInt(month, 10) - 1;
    if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_LABELS.length) {
      return dateISO;
    }
    const label = MONTH_LABELS[monthIndex];
    const yearSuffix = year.slice(-2);
    return `${label}/${yearSuffix}`;
  }

  if (!day) {
    return `${month}/${year}`;
  }

  return `${day}/${month}/${year}`;
}

export function formatPercentSignedBR(value: number | null | undefined, casas = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const abs = Math.abs(value).toFixed(casas).replace('.', ',');
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${abs}%`;
}
