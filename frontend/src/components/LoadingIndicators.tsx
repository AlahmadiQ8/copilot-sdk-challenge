interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
};

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-slate-600 border-t-sky-400 ${sizeMap[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
}

export function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50 ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-sky-500 transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
