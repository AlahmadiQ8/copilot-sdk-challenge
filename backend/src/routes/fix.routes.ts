import { Router, Request, Response, NextFunction } from 'express';
import { triggerFix, getFixSession } from '../services/fix.service.js';
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
