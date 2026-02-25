import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useChatFixSession } from '../hooks/useChatFixSession';
import type { ChatItem } from '../hooks/useChatFixSession';
import CopilotIcon from './CopilotIcon';

interface ChatFixPanelProps {
  ruleId: string;
  analysisRunId: string;
  ruleName?: string;
  onClose: () => void;
}

export default function ChatFixPanel({ ruleId, analysisRunId, ruleName, onClose }: ChatFixPanelProps) {
  const {
    session,
    items,
    isProcessing,
    isConnecting,
    error,
    sendMessage,
    approve,
    reject,
    restart,
    close,
  } = useChatFixSession(ruleId, analysisRunId);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length, items[items.length - 1]]);

  // Focus input when idle
  useEffect(() => {
    if (!isProcessing && !isConnecting) {
      inputRef.current?.focus();
    }
  }, [isProcessing, isConnecting]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isProcessing) return;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = async () => {
    await close();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Fix with Copilot">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Panel */}
      <div className="relative flex w-full max-w-xl flex-col border-l border-slate-700/50 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-100"><CopilotIcon className="h-4 w-4" /> Fix with Copilot</h2>
            {ruleName && <p className="truncate text-xs text-slate-400">{ruleName}</p>}
            {session?.resumed && (
              <span className="mt-0.5 inline-block rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                Resumed session
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={restart}
              disabled={isConnecting}
              className="rounded-md px-2.5 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
              title="Clear & restart"
            >
              ↻ Restart
            </button>
            <button
              onClick={handleClose}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-b border-red-900/50 bg-red-950/30 px-5 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Connecting state */}
        {isConnecting && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
              Connecting to AI session…
            </div>
          </div>
        )}

        {/* Chat area */}
        {!isConnecting && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" role="log" aria-label="Chat messages">
            {items.map((item, i) => (
              <ChatItemRenderer key={i} item={item} onApprove={approve} onReject={reject} />
            ))}

            {isProcessing && !items.some(i => i.kind === 'assistant_delta') && (
              <div className="flex items-center gap-2 py-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
                <span className="text-xs text-slate-500">Thinking…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {/* Input area */}
        {!isConnecting && (
          <div className="border-t border-slate-700/50 px-5 py-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? 'AI is processing…' : 'Send a message…'}
                disabled={isProcessing}
                className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={isProcessing || !input.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat Item Renderer ──

function ChatItemRenderer({
  item,
  onApprove,
  onReject,
}: {
  item: ChatItem;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string, reason?: string) => void;
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-xl rounded-br-sm bg-violet-600/80 px-3.5 py-2 text-sm text-white">
            {item.content}
          </div>
        </div>
      );

    case 'assistant':
    case 'assistant_delta':
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-slate-800 px-3.5 py-2 text-sm text-slate-200">
            <AssistantContent content={item.content} />
            {item.kind === 'assistant_delta' && (
              <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400" />
            )}
          </div>
        </div>
      );

    case 'reasoning':
      return (
        <div className="rounded-lg border border-sky-900/30 bg-sky-950/20 px-3 py-2 text-xs text-sky-300/70">
          <span className="mr-1.5 font-medium text-sky-400">💭 Reasoning</span>
          {item.content}
        </div>
      );

    case 'tool_executing':
      return (
        <ToolCard
          icon="🔧"
          label={item.isWrite ? 'Write Tool' : 'Read Tool'}
          color={item.isWrite ? 'amber' : 'slate'}
          toolName={item.toolName}
          args={item.args}
          spinning
        />
      );

    case 'tool_result':
      return (
        <ToolCard
          icon="✓"
          label="Result"
          color="emerald"
          toolName={item.toolName}
          result={item.result}
        />
      );

    case 'approval_required':
      return (
        <ApprovalCard
          proposalId={item.proposalId}
          toolName={item.toolName}
          operation={item.operation}
          description={item.description}
          args={item.args}
          onApprove={onApprove}
          onReject={onReject}
        />
      );

    case 'approval_resolved':
      return (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${item.approved ? 'border-emerald-800/50 bg-emerald-950/20 text-emerald-400' : 'border-red-800/50 bg-red-950/20 text-red-400'}`}
        >
          {item.approved ? '✓ Approved' : `✕ Rejected${item.reason ? `: ${item.reason}` : ''}`}
        </div>
      );

    case 'session_idle':
      return null; // Don't render, the input focus handles this

    case 'error':
      return (
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
          ✕ {item.message}
        </div>
      );

    default:
      return null;
  }
}

// ── Sub-components ──

function AssistantContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
        em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="text-slate-200">{children}</li>,
        h1: ({ children }) => <h1 className="mb-1 text-base font-bold text-slate-100">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1 text-sm font-bold text-slate-100">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold text-slate-100">{children}</h3>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <pre className="my-1.5 overflow-x-auto rounded bg-slate-900 px-2 py-1.5 text-xs text-slate-300">
                <code {...props}>{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-slate-900 px-1 py-0.5 text-xs text-violet-300" {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="my-1.5 border-l-2 border-slate-600 pl-3 text-slate-400 italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 underline hover:text-violet-300">
            {children}
          </a>
        ),
        hr: () => <hr className="my-2 border-slate-700" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function ToolCard({
  icon,
  label,
  color,
  toolName,
  args,
  result,
  spinning,
}: {
  icon: string;
  label: string;
  color: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  spinning?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorMap: Record<string, string> = {
    amber: 'border-amber-800/30 bg-amber-950/10 text-amber-400',
    emerald: 'border-emerald-800/30 bg-emerald-950/10 text-emerald-400',
    slate: 'border-slate-700/30 bg-slate-800/30 text-slate-400',
  };

  const detail = args ? JSON.stringify(args, null, 2) : result ? JSON.stringify(result, null, 2) : null;

  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color] || colorMap.slate}`}>
      <div
        className="flex items-center gap-2 text-xs cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
        {spinning && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        )}
        <span>{icon}</span>
        <span className="font-medium">{label}</span>
        <code className="ml-1 text-[10px] opacity-70">{toolName}</code>
        {detail && (
          <svg
            className={`ml-auto h-3 w-3 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
      {expanded && detail && (
        <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] opacity-60">
          {detail}
        </pre>
      )}
    </div>
  );
}

function ApprovalCard({
  proposalId,
  toolName,
  operation,
  description,
  args,
  onApprove,
  onReject,
}: {
  proposalId: string;
  toolName: string;
  operation: string;
  description: string;
  args: Record<string, unknown>;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [responded, setResponded] = useState(false);

  return (
    <div className="rounded-xl border-2 border-amber-500/40 bg-amber-950/20 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Approval Required
      </div>

      <p className="mb-1 text-sm text-slate-200">{description}</p>

      <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
        <code>{toolName}</code>
        <span>·</span>
        <span className="font-medium text-amber-300">{operation}</span>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <pre className="mb-3 max-h-32 overflow-auto rounded bg-slate-900/50 p-2 text-[11px] text-slate-400">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}

      {!responded && (
        <div className="flex gap-2">
          <button
            onClick={() => { setResponded(true); onApprove(proposalId); }}
            className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
          >
            ✓ Approve
          </button>
          <button
            onClick={() => { setResponded(true); onReject(proposalId); }}
            className="rounded-lg bg-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-600"
          >
            ✕ Reject
          </button>
        </div>
      )}

      {responded && (
        <p className="text-xs text-slate-500">Waiting for result…</p>
      )}
    </div>
  );
}
