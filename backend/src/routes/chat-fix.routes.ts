import { Router, Request, Response, NextFunction } from 'express';
import {
  getOrResumeSession,
  sendMessage,
  approveToolCall,
  rejectToolCall,
  clearAndRestartSession,
  closeSession,
  getActiveSessions,
  getSSEEmitter,
} from '../services/chat-fix.service.js';

export const chatFixRouter = Router();

/**
 * @openapi
 * /api/chat-fix/sessions:
 *   post:
 *     summary: Create or resume a chat fix session for a rule
 *     tags: [Chat Fix]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ruleId, analysisRunId]
 *             properties:
 *               ruleId:
 *                 type: string
 *               analysisRunId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Session created or resumed
 */
chatFixRouter.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ruleId, analysisRunId } = req.body;
    if (!ruleId || !analysisRunId) {
      res.status(400).json({ error: 'ruleId and analysisRunId are required' });
      return;
    }
    const session = await getOrResumeSession(ruleId, analysisRunId);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/active:
 *   get:
 *     summary: Get all active chat fix sessions for an analysis run
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: query
 *         name: analysisRunId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of active sessions
 */
chatFixRouter.get('/sessions/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisRunId = req.query.analysisRunId as string;
    if (!analysisRunId) {
      res.status(400).json({ error: 'analysisRunId query parameter is required' });
      return;
    }
    const sessions = await getActiveSessions(analysisRunId);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}/stream:
 *   get:
 *     summary: Stream chat fix session events via SSE
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE event stream
 */
chatFixRouter.get('/sessions/:sessionId/stream', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const emitter = getSSEEmitter(sessionId);

  if (!emitter) {
    res.status(404).json({ error: 'Session not found or not active' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const handler = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('sse', handler);

  req.on('close', () => {
    emitter.removeListener('sse', handler);
  });
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}/messages:
 *   post:
 *     summary: Send a user message to the chat fix session
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent
 *       404:
 *         description: Session not found
 *       409:
 *         description: Session is currently processing
 */
chatFixRouter.post('/sessions/:sessionId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    await sendMessage(sessionId, content);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}/approve:
 *   post:
 *     summary: Approve a pending tool call
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposalId]
 *             properties:
 *               proposalId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Approval registered
 *       404:
 *         description: Proposal not found
 */
chatFixRouter.post('/sessions/:sessionId/approve', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const { proposalId } = req.body;
  if (!proposalId) {
    res.status(400).json({ error: 'proposalId is required' });
    return;
  }
  const resolved = approveToolCall(sessionId, proposalId);
  if (resolved) {
    res.json({ ok: true, approved: true });
  } else {
    res.status(404).json({ error: 'Proposal not found or already resolved' });
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}/reject:
 *   post:
 *     summary: Reject a pending tool call
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposalId]
 *             properties:
 *               proposalId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rejection registered
 *       404:
 *         description: Proposal not found
 */
chatFixRouter.post('/sessions/:sessionId/reject', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const { proposalId, reason } = req.body;
  if (!proposalId) {
    res.status(400).json({ error: 'proposalId is required' });
    return;
  }
  const resolved = rejectToolCall(sessionId, proposalId, reason);
  if (resolved) {
    res.json({ ok: true, approved: false });
  } else {
    res.status(404).json({ error: 'Proposal not found or already resolved' });
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}/restart:
 *   post:
 *     summary: Clear session and start a fresh one
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New session created
 *       404:
 *         description: Session not found
 */
chatFixRouter.post('/sessions/:sessionId/restart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const newSession = await clearAndRestartSession(sessionId);
    res.json(newSession);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/chat-fix/sessions/{sessionId}:
 *   delete:
 *     summary: Close a chat fix session
 *     tags: [Chat Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session closed
 */
chatFixRouter.delete('/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    await closeSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
