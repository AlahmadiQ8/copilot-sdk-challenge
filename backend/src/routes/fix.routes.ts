import { Router, Request, Response, NextFunction } from 'express';
import { triggerFix, getFixSession } from '../services/fix.service.js';
import { logger } from '../middleware/logger.js';

export const fixRouter = Router();

// POST /findings/:findingId/fix — Trigger AI auto-fix
fixRouter.post('/findings/:findingId/fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const findingId = req.params.findingId as string;
    const sessionId = await triggerFix(findingId);
    res.json({ id: sessionId, findingId, status: 'RUNNING', startedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// GET /findings/:findingId/fix/stream — SSE stream of fix progress
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

// GET /findings/:findingId/fix/session — Get fix session details
fixRouter.get('/findings/:findingId/fix/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const findingId = req.params.findingId as string;
    const session = await getFixSession(findingId);
    res.json(session);
  } catch (err) {
    next(err);
  }
});
