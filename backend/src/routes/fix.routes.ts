import { Router, Request, Response, NextFunction } from 'express';
import { triggerFix, getFixSession, triggerBulkFix, getBulkFixSession, getBulkFixSessionByRule } from '../services/fix.service.js';
import { logger } from '../middleware/logger.js';

export const fixRouter = Router();

/**
 * @openapi
 * /api/findings/{findingId}/fix:
 *   post:
 *     summary: Trigger AI auto-fix for a finding
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: findingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fix initiated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FixSession'
 *       404:
 *         description: Finding not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Fix already in progress or finding already fixed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
fixRouter.post('/findings/:findingId/fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const findingId = req.params.findingId as string;
    const sessionId = await triggerFix(findingId);
    res.json({ id: sessionId, findingId, status: 'RUNNING', startedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/findings/{findingId}/fix/stream:
 *   get:
 *     summary: Stream fix progress via Server-Sent Events
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: findingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE stream of fix progress events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
fixRouter.get('/findings/:findingId/fix/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const findingId = req.params.findingId as string;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sseSessionId = await triggerFix(findingId, (step) => {
      res.write(`data: ${JSON.stringify(step)}\n\n`);
    });

    // Send initial session info
    res.write(`data: ${JSON.stringify({ type: 'session_started', sessionId: sseSessionId })}\n\n`);

    // Poll for completion
    const checkInterval = setInterval(async () => {
      try {
        const session = await getFixSession(findingId);
        if (session.status === 'COMPLETED' || session.status === 'FAILED') {
          res.write(`data: ${JSON.stringify({ type: 'session_ended', status: session.status })}\n\n`);
          clearInterval(checkInterval);
          res.end();
        }
      } catch {
        clearInterval(checkInterval);
        res.end();
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(checkInterval);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/findings/{findingId}/fix/session:
 *   get:
 *     summary: Get the AI fix session details for a finding
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: findingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fix session details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FixSessionDetail'
 *       404:
 *         description: Fix session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
fixRouter.get('/findings/:findingId/fix/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const findingId = req.params.findingId as string;
    const session = await getFixSession(findingId);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/rules/{ruleId}/fix-all:
 *   post:
 *     summary: Trigger bulk AI fix for all unfixed findings of a rule
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [analysisRunId]
 *             properties:
 *               analysisRunId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk fix initiated
 *       404:
 *         description: No unfixed findings for this rule
 */
fixRouter.post('/rules/:ruleId/fix-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const { analysisRunId } = req.body;
    if (!analysisRunId) {
      res.status(400).json({ error: 'analysisRunId is required' });
      return;
    }
    const sessionId = await triggerBulkFix(ruleId, analysisRunId);
    res.json({ id: sessionId, ruleId, analysisRunId, status: 'RUNNING', startedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/rules/{ruleId}/fix-all/stream:
 *   get:
 *     summary: Stream bulk fix progress via Server-Sent Events
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: analysisRunId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE stream of bulk fix progress events
 */
fixRouter.get('/rules/:ruleId/fix-all/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const analysisRunId = req.query.analysisRunId as string;
    if (!analysisRunId) {
      res.status(400).json({ error: 'analysisRunId query parameter is required' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sseSessionId = await triggerBulkFix(ruleId, analysisRunId, (step) => {
      res.write(`data: ${JSON.stringify(step)}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'session_started', sessionId: sseSessionId })}\n\n`);

    const checkInterval = setInterval(async () => {
      try {
        const session = await getBulkFixSession(sseSessionId);
        if (session.status === 'COMPLETED' || session.status === 'FAILED') {
          res.write(`data: ${JSON.stringify({ type: 'session_ended', status: session.status, fixedCount: session.fixedCount, failedCount: session.failedCount })}\n\n`);
          clearInterval(checkInterval);
          res.end();
        }
      } catch {
        clearInterval(checkInterval);
        res.end();
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(checkInterval);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/bulk-fix/{sessionId}:
 *   get:
 *     summary: Get bulk fix session details
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk fix session details
 *       404:
 *         description: Session not found
 */
fixRouter.get('/bulk-fix/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = await getBulkFixSession(sessionId);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/bulk-fix/by-rule/{ruleId}:
 *   get:
 *     summary: Get latest bulk fix session for a rule
 *     tags: [AI Fix]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: analysisRunId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk fix session details
 *       404:
 *         description: Session not found
 */
fixRouter.get('/bulk-fix/by-rule/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const analysisRunId = req.query.analysisRunId as string;
    if (!analysisRunId) {
      res.status(400).json({ error: 'analysisRunId query parameter is required' });
      return;
    }
    const session = await getBulkFixSessionByRule(ruleId, analysisRunId);
    res.json(session);
  } catch (err) {
    next(err);
  }
});
