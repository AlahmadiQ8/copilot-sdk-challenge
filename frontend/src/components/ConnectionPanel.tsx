import { useState, useEffect, useCallback } from 'react';
import type { PbiInstance, ConnectionStatus } from '../types/api';
import * as api from '../services/api';

interface ConnectionPanelProps {
  onConnectionChange: (status: ConnectionStatus) => void;
}

export default function ConnectionPanel({ onConnectionChange }: ConnectionPanelProps) {
  const [instances, setInstances] = useState<PbiInstance[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchInstances = useCallback(async () => {
    try {
      const { instances: list } = await api.listInstances();
      setInstances(list);
      if (list.length > 0 && !selected) {
        setSelected(`${list[0].serverAddress}|${list[0].databaseName}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instances');
    }
  }, [selected]);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getConnectionStatus();
      setStatus(s);
      onConnectionChange(s);
    } catch {
      // Server might not be running
    }
  }, [onConnectionChange]);

  useEffect(() => {
    fetchInstances();
    fetchStatus();
  }, [fetchInstances, fetchStatus]);

  const handleConnect = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const [serverAddress, databaseName] = selected.split('|');
      const s = await api.connect(serverAddress, databaseName);
      setStatus(s);
      onConnectionChange(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError('');
    try {
      await api.disconnect();
      const s: ConnectionStatus = { connected: false };
      setStatus(s);
      onConnectionChange(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="connection-panel rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 backdrop-blur-sm" aria-label="Connection management">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 rounded-full ${status.connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-500'}`}
        />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {status.connected ? `Connected to ${status.modelName}` : 'Not Connected'}
        </h2>
      </div>

      {!status.connected ? (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="instance-select"
              className="mb-1.5 block text-xs font-medium text-slate-400"
            >
              Power BI Instance
            </label>
            <select
              id="instance-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700/80 px-3 py-2 text-sm text-slate-100 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              aria-label="Select Power BI instance"
            >
              {instances.length === 0 && <option value="">No instances found</option>}
              {instances.map((inst) => (
                <option
                  key={`${inst.serverAddress}|${inst.databaseName}`}
                  value={`${inst.serverAddress}|${inst.databaseName}`}
                >
                  {inst.name} ({inst.databaseName})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleConnect}
            disabled={loading || !selected || instances.length === 0}
            className="shrink-0 rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-40"
            aria-label="Connect to selected instance"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
          <button
            onClick={fetchInstances}
            className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Refresh instances"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1 text-xs text-slate-400">
            <span className="text-slate-300">{status.serverAddress}</span> · {status.databaseName}
            {status.connectedAt && (
              <span className="ml-2 text-slate-500">
                since {new Date(status.connectedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="rounded-lg border border-red-800/60 px-4 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-700 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="Disconnect from model"
          >
            {loading ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
