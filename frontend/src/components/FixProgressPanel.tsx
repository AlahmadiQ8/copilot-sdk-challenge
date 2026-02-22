import { useState, useEffect, useRef } from 'react';
import type { FixSessionStep } from '../types/api';

interface FixProgressPanelProps {
  findingId: string;
  onComplete?: () => void;
}

const eventTypeStyles: Record<string, { label: string; color: string; icon: string }> = {
  reasoning: { label: 'Reasoning', color: 'text-sky-400', icon: '💭' },
  tool_call: { label: 'Tool Call', color: 'text-amber-400', icon: '🔧' },
  tool_result: { label: 'Tool Result', color: 'text-emerald-400', icon: '✓' },
  message: { label: 'Message', color: 'text-slate-200', icon: '💬' },
  error: { label: 'Error', color: 'text-red-400', icon: '✕' },
};

export default function FixProgressPanel({ findingId, onComplete }: FixProgressPanelProps) {
  const [steps, setSteps] = useState<(FixSessionStep & { stepNumber: number })[]>([]);
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'completed' | 'failed'>(
    'connecting',
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const eventSource = new EventSource(
      `${apiBase}/findings/${encodeURIComponent(findingId)}/fix/stream`,
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'session_started') {
        setStatus('streaming');
        return;
      }
      if (data.type === 'session_ended') {
        setStatus(data.status === 'COMPLETED' ? 'completed' : 'failed');
        eventSource.close();
        onComplete?.();
        return;
      }
      if (data.type === 'session_error') {
        setStatus('failed');
        setSteps((prev) => [
          ...prev,
          {
            id: `step-${prev.length}`,
            stepNumber: prev.length + 1,
            eventType: 'error' as const,
            content: data.error || 'Unknown error',
            timestamp: new Date().toISOString(),
          },
        ]);
        eventSource.close();
        return;
      }

      // It's a step
      setSteps((prev) => [
        ...prev,
        {
          id: `step-${prev.length}`,
          stepNumber: data.stepNumber,
          eventType: data.eventType,
          content: data.content,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    eventSource.onerror = () => {
      setStatus('failed');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [findingId, onComplete]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps]);

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Fix Progress</h3>
        <span
          className={`text-xs font-medium ${
            status === 'completed'
              ? 'text-emerald-400'
              : status === 'failed'
                ? 'text-red-400'
                : status === 'streaming'
                  ? 'text-amber-400'
                  : 'text-slate-400'
          }`}
        >
          {status === 'connecting' && 'Connecting…'}
          {status === 'streaming' && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              In Progress
            </span>
          )}
          {status === 'completed' && 'Completed'}
          {status === 'failed' && 'Failed'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-64 space-y-2 overflow-y-auto pr-1"
        role="log"
        aria-label="Fix progress steps"
      >
        {steps.map((step, i) => {
          const style = eventTypeStyles[step.eventType] || eventTypeStyles.message;
          return (
            <div key={i} className="flex gap-2 text-xs">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span className={`font-medium ${style.color}`}>{style.label}</span>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-400">
                  {step.content.length > 500 ? `${step.content.slice(0, 500)}…` : step.content}
                </p>
              </div>
              <span className="shrink-0 text-slate-600">
                {new Date(step.timestamp).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        {steps.length === 0 && status === 'connecting' && (
          <p className="py-4 text-center text-xs text-slate-500">Waiting for fix to start…</p>
        )}
      </div>
    </div>
  );
}
