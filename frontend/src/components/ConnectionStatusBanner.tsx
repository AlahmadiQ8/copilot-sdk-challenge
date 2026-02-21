import { useState, useEffect, useRef } from 'react';
import * as api from '../services/api';

interface ConnectionStatusBannerProps {
  connected: boolean;
  onReconnected?: () => void;
}

export default function ConnectionStatusBanner({ connected, onReconnected }: ConnectionStatusBannerProps) {
  const [lost, setLost] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!connected) {
      setLost(false);
      return;
    }

    // Poll health every 15 seconds
    intervalRef.current = setInterval(async () => {
      try {
        const { healthy } = await api.checkConnectionHealth();
        if (!healthy) {
          setLost(true);
        } else if (lost) {
          setLost(false);
          onReconnected?.();
        }
      } catch {
        setLost(true);
      }
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [connected, lost, onReconnected]);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const status = await api.getConnectionStatus();
      if (status.connected && status.serverAddress && status.databaseName) {
        await api.connect(status.serverAddress, status.databaseName);
      }
      const { healthy } = await api.checkConnectionHealth();
      if (healthy) {
        setLost(false);
        onReconnected?.();
      }
    } catch {
      // still lost
    } finally {
      setReconnecting(false);
    }
  };

  if (!lost) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-amber-700/50 bg-amber-900/30 px-4 py-2 lg:px-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2 text-sm text-amber-300">
        <span aria-hidden="true">⚠</span>
        <span>Connection to the Power BI model was lost. Your findings and query history are preserved.</span>
      </div>
      <button
        onClick={handleReconnect}
        disabled={reconnecting}
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
      >
        {reconnecting ? 'Reconnecting…' : 'Reconnect'}
      </button>
    </div>
  );
}
