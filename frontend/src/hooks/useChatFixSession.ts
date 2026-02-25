import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatFixSession, ChatFixSSEEvent } from '../types/api';
import {
  createOrResumeChatFixSession,
  sendChatFixMessage,
  approveChatFixTool,
  rejectChatFixTool,
  restartChatFixSession,
  closeChatFixSession,
  createChatFixSSEUrl,
} from '../services/api';

// ── Chat item types rendered in the UI ──

export type ChatItem =
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string }
  | { kind: 'assistant_delta'; content: string }
  | { kind: 'reasoning'; content: string }
  | { kind: 'tool_executing'; toolName: string; args: Record<string, unknown>; isWrite: boolean }
  | { kind: 'tool_result'; toolName: string; result: unknown; isWrite: boolean; proposalId?: string }
  | { kind: 'approval_required'; proposalId: string; toolName: string; operation: string; args: Record<string, unknown>; description: string }
  | { kind: 'approval_resolved'; proposalId: string; approved: boolean; reason?: string }
  | { kind: 'error'; message: string }
  | { kind: 'session_idle' };

export interface UseChatFixSessionReturn {
  session: ChatFixSession | null;
  items: ChatItem[];
  isProcessing: boolean;
  isConnecting: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  approve: (proposalId: string) => Promise<void>;
  reject: (proposalId: string, reason?: string) => Promise<void>;
  restart: () => Promise<void>;
  close: () => Promise<void>;
}

export function useChatFixSession(
  ruleId: string | null,
  analysisRunId: string | null,
): UseChatFixSessionReturn {
  const [session, setSession] = useState<ChatFixSession | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const deltaBufRef = useRef('');
  const sessionIdRef = useRef<string | null>(null);

  // Cleanup SSE on unmount or session change
  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Connect SSE stream
  const connectSSE = useCallback((sessionId: string) => {
    cleanupSSE();
    const url = createChatFixSSEUrl(sessionId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: ChatFixSSEEvent = JSON.parse(e.data);

        switch (event.type) {
          case 'message_delta':
            deltaBufRef.current += event.content;
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.kind === 'assistant_delta') {
                return [...prev.slice(0, -1), { kind: 'assistant_delta', content: deltaBufRef.current }];
              }
              return [...prev, { kind: 'assistant_delta', content: deltaBufRef.current }];
            });
            break;

          case 'message_complete':
            // Replace delta with final message
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.kind === 'assistant_delta') {
                return [...prev.slice(0, -1), { kind: 'assistant', content: event.content }];
              }
              return [...prev, { kind: 'assistant', content: event.content }];
            });
            deltaBufRef.current = '';
            break;

          case 'reasoning':
            setItems((prev) => [...prev, { kind: 'reasoning', content: event.content }]);
            break;

          case 'tool_executing':
            setItems((prev) => [...prev, { kind: 'tool_executing', toolName: event.toolName, args: event.args, isWrite: event.isWrite }]);
            break;

          case 'tool_result':
            setItems((prev) => [...prev, { kind: 'tool_result', toolName: event.toolName, result: event.result, isWrite: event.isWrite, proposalId: event.proposalId }]);
            break;

          case 'approval_required':
            setItems((prev) => [...prev, { kind: 'approval_required', proposalId: event.proposalId, toolName: event.toolName, operation: event.operation, args: event.args, description: event.description }]);
            setIsProcessing(false); // waiting for user action
            break;

          case 'approval_resolved':
            setItems((prev) => [...prev, { kind: 'approval_resolved', proposalId: event.proposalId, approved: event.approved, reason: event.reason }]);
            setIsProcessing(true); // AI continues
            break;

          case 'session_idle':
            setItems((prev) => [...prev, { kind: 'session_idle' }]);
            setIsProcessing(false);
            deltaBufRef.current = '';
            break;

          case 'error':
            setItems((prev) => [...prev, { kind: 'error', message: event.message }]);
            setIsProcessing(false);
            break;

          default:
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setIsProcessing(false);
      // If the connection was permanently closed (e.g. server returned 404
      // because the session no longer exists in memory), stop reconnecting.
      if (es.readyState === EventSource.CLOSED) {
        cleanupSSE();
        setError('Connection to session lost. Click Restart to begin a new session.');
      }
    };
  }, [cleanupSSE]);

  // Initialize session when ruleId + analysisRunId are set
  useEffect(() => {
    if (!ruleId || !analysisRunId) {
      cleanupSSE();
      setSession(null);
      setItems([]);
      setError(null);
      sessionIdRef.current = null;
      return;
    }

    let cancelled = false;

    async function init() {
      setIsConnecting(true);
      setError(null);
      try {
        const sess = await createOrResumeChatFixSession(ruleId!, analysisRunId!);
        if (cancelled) return;
        setSession(sess);
        sessionIdRef.current = sess.sessionId;

        // Restore history for resumed sessions
        if (sess.resumed && sess.messages.length > 0) {
          const restored: ChatItem[] = sess.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              kind: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          setItems(restored);
        } else {
          setItems([]);
        }

        setIsProcessing(true); // initial prompt will stream
        connectSSE(sess.sessionId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to create session');
        }
      } finally {
        if (!cancelled) setIsConnecting(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanupSSE();
    };
  }, [ruleId, analysisRunId, connectSSE, cleanupSSE]);

  // ── Actions ──

  const sendMessage = useCallback(async (content: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setItems((prev) => [...prev, { kind: 'user', content }]);
    setIsProcessing(true);
    deltaBufRef.current = '';
    try {
      await sendChatFixMessage(sid, content);
    } catch (err) {
      setItems((prev) => [...prev, { kind: 'error', message: err instanceof Error ? err.message : 'Send failed' }]);
      setIsProcessing(false);
    }
  }, []);

  const approve = useCallback(async (proposalId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await approveChatFixTool(sid, proposalId);
    } catch (err) {
      setItems((prev) => [...prev, { kind: 'error', message: err instanceof Error ? err.message : 'Approve failed' }]);
    }
  }, []);

  const reject = useCallback(async (proposalId: string, reason?: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await rejectChatFixTool(sid, proposalId, reason);
    } catch (err) {
      setItems((prev) => [...prev, { kind: 'error', message: err instanceof Error ? err.message : 'Reject failed' }]);
    }
  }, []);

  const restart = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    cleanupSSE();
    setIsConnecting(true);
    setError(null);
    try {
      const newSess = await restartChatFixSession(sid);
      setSession(newSess);
      sessionIdRef.current = newSess.sessionId;
      setItems([]);
      setIsProcessing(true);
      connectSSE(newSess.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restart failed');
    } finally {
      setIsConnecting(false);
    }
  }, [cleanupSSE, connectSSE]);

  const close = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    cleanupSSE();
    try {
      await closeChatFixSession(sid);
    } catch {
      // Ignore
    }
    setSession(null);
    setItems([]);
    sessionIdRef.current = null;
  }, [cleanupSSE]);

  return { session, items, isProcessing, isConnecting, error, sendMessage, approve, reject, restart, close };
}
