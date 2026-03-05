interface MetricCardProps {
  label: string;
  value: string | number;
  highlight?: 'default' | 'success' | 'warning' | 'danger';
}

const HIGHLIGHT_STYLES = {
  default: 'text-gray-100',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  danger:  'text-red-400',
} as const;

export function MetricCard({ label, value, highlight = 'default' }: MetricCardProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${HIGHLIGHT_STYLES[highlight]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
