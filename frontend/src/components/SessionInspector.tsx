import { useState, useEffect } from 'react';
import type { FixSessionDetail, FixSessionStep } from '../types/api';
import * as api from '../services/api';

interface SessionInspectorProps {
  findingId: string;
  onClose: () => void;
}

const eventTypeStyles: Record<string, { label: string; color: string; icon: string }> = {
  reasoning: { label: 'Reasoning', color: 'text-sky-400', icon: '💭' },
  tool_call: { label: 'Tool Call', color: 'text-amber-400', icon: '🔧' },
  tool_result: { label: 'Tool Result', color: 'text-emerald-400', icon: '✓' },
  message: { label: 'Message', color: 'text-slate-200', icon: '💬' },
  error: { label: 'Error', color: 'text-red-400', icon: '✕' },
};

export default function SessionInspector({ findingId, onClose }: SessionInspectorProps) {
  const [session, setSession] = useState<FixSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getFixSession(findingId);
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setLoading(false);
      }
    })();
  }, [findingId]);

  const totalDuration =
    session?.completedAt && session?.startedAt
      ? Math.round(
          (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000,
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-label="Session Inspector"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg overflow-y-auto border-l border-slate-700/50 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Session Inspector</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Close session inspector"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-slate-400">Loading session…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {session && (
          <>
            {/* Session metadata */}
            <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span
                  className={
                    session.status === 'COMPLETED'
                      ? 'text-emerald-400'
                      : session.status === 'FAILED'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }
                >
                  {session.status}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-400">Started</span>
                <span className="text-slate-300">
                  {new Date(session.startedAt).toLocaleString()}
                </span>
              </div>
              {totalDuration !== null && (
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-400">Duration</span>
                  <span className="text-slate-300">{totalDuration}s</span>
                </div>
              )}
              <div className="mt-1 flex justify-between">
                <span className="text-slate-400">Steps</span>
                <span className="text-slate-300">{session.steps.length}</span>
              </div>
            </div>

            {/* Steps timeline */}
            <div className="space-y-3" role="log" aria-label="Session steps">
              {session.steps.map((step: FixSessionStep) => {
                const style = eventTypeStyles[step.eventType] || eventTypeStyles.message;
                return (
                  <div
                    key={step.id}
                    className="rounded-lg border border-slate-700/30 bg-slate-800/30 p-3"
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-xs">
                      <span aria-hidden="true">{style.icon}</span>
                      <span className={`font-semibold ${style.color}`}>{style.label}</span>
                      <span className="ml-auto text-slate-500">
                        #{step.stepNumber} · {new Date(step.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-400">
                      {formatContent(step.content)}
                    </pre>
                  </div>
                );
              })}
              {session.steps.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-500">No steps recorded.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}
