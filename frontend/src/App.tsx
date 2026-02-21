import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState } from 'react';
import type { ConnectionStatus } from './types/api';
import AnalyzerPage from './pages/AnalyzerPage';
import DaxQueryPage from './pages/DaxQueryPage';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import ConnectionStatusBanner from './components/ConnectionStatusBanner';

export default function App() {
  const [connection, setConnection] = useState<ConnectionStatus>({ connected: false });

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
        {/* Skip navigation link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sky-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:outline-none"
        >
          Skip to main content
        </a>

        {/* Header */}
        <header className="border-b border-slate-700/50 bg-slate-800/80 backdrop-blur-sm" role="banner">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 lg:px-6 2xl:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold">
                PBI
              </div>
              <h1 className="text-base font-semibold tracking-tight">
                Best Practices Analyzer
              </h1>
            </div>

            <nav className="flex items-center gap-1" aria-label="Main navigation">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-md px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`
                }
              >
                Analyzer
              </NavLink>
              <NavLink
                to="/dax"
                className={({ isActive }) =>
                  `rounded-md px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`
                }
              >
                DAX Queries
              </NavLink>
            </nav>

            <div className="flex items-center gap-2 text-xs text-slate-400" aria-live="polite">
              <div
                className={`h-2 w-2 rounded-full ${
                  connection.connected
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]'
                    : 'bg-slate-500'
                }`}
                aria-hidden="true"
              />
              <span>{connection.connected ? connection.modelName : 'Disconnected'}</span>
            </div>
          </div>
        </header>

        {/* Connection lost banner */}
        <ConnectionStatusBanner connected={connection.connected} />

        {/* Main content */}
        <main className="flex-1" id="main-content" role="main">
          <ErrorBoundary>
            <Routes>
              <Route
                path="/"
                element={
                  <AnalyzerPage
                    connection={connection}
                    onConnectionChange={setConnection}
                  />
                }
              />
              <Route
                path="/dax"
                element={<DaxQueryPage />}
              />
            </Routes>
          </ErrorBoundary>
        </main>

        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}
