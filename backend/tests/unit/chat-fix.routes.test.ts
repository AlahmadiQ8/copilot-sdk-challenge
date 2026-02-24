import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ──

const mockService = {
  getOrResumeSession: vi.fn(),
  sendMessage: vi.fn(),
  approveToolCall: vi.fn(),
  rejectToolCall: vi.fn(),
  clearAndRestartSession: vi.fn(),
  closeSession: vi.fn(),
  getActiveSessions: vi.fn(),
  getSSEEmitter: vi.fn(),
};

vi.mock('../../src/services/chat-fix.service.js', () => mockService);

vi.mock('../../src/middleware/logger.js', () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { chatFixRouter } = await import('../../src/routes/chat-fix.routes.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat-fix', chatFixRouter);
  // Simple error handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

describe('chat-fix.routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /sessions', () => {
    it('returns 400 when ruleId is missing', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions')
        .send({ analysisRunId: 'run1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ruleId/);
    });

    it('returns 400 when analysisRunId is missing', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions')
        .send({ ruleId: 'R1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/analysisRunId/);
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions')
        .send({});

      expect(res.status).toBe(400);
    });

    it('creates/resumes session successfully', async () => {
      mockService.getOrResumeSession.mockResolvedValue({
        sessionId: 's1',
        ruleId: 'R1',
        analysisRunId: 'run1',
        status: 'ACTIVE',
        resumed: false,
        messages: [],
      });

      const res = await request(app)
        .post('/api/chat-fix/sessions')
        .send({ ruleId: 'R1', analysisRunId: 'run1' });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('s1');
      expect(mockService.getOrResumeSession).toHaveBeenCalledWith('R1', 'run1');
    });

    it('forwards service errors', async () => {
      mockService.getOrResumeSession.mockRejectedValue(
        Object.assign(new Error('No MCP connection'), { statusCode: 422 }),
      );

      const res = await request(app)
        .post('/api/chat-fix/sessions')
        .send({ ruleId: 'R1', analysisRunId: 'run1' });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/MCP/);
    });
  });

  describe('GET /sessions/active', () => {
    it('returns 400 when analysisRunId is missing', async () => {
      const res = await request(app)
        .get('/api/chat-fix/sessions/active');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/analysisRunId/);
    });

    it('returns active sessions', async () => {
      mockService.getActiveSessions.mockResolvedValue([
        { id: 's1', ruleId: 'R1', analysisRunId: 'run1', status: 'ACTIVE' },
      ]);

      const res = await request(app)
        .get('/api/chat-fix/sessions/active?analysisRunId=run1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('s1');
    });
  });

  describe('GET /sessions/:sessionId/stream', () => {
    it('returns 404 when session not found', async () => {
      mockService.getSSEEmitter.mockReturnValue(null);

      const res = await request(app)
        .get('/api/chat-fix/sessions/nonexistent/stream');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions/:sessionId/messages', () => {
    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/messages')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content/);
    });

    it('sends message successfully', async () => {
      mockService.sendMessage.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/messages')
        .send({ content: 'Fix this please' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockService.sendMessage).toHaveBeenCalledWith('s1', 'Fix this please');
    });

    it('forwards 404 from service', async () => {
      mockService.sendMessage.mockRejectedValue(
        Object.assign(new Error('Session not found'), { statusCode: 404 }),
      );

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/messages')
        .send({ content: 'hello' });

      expect(res.status).toBe(404);
    });

    it('forwards 409 from service', async () => {
      mockService.sendMessage.mockRejectedValue(
        Object.assign(new Error('Session is currently processing'), { statusCode: 409 }),
      );

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/messages')
        .send({ content: 'hello' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /sessions/:sessionId/approve', () => {
    it('returns 400 when proposalId is missing', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/approve')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/proposalId/);
    });

    it('returns 200 on successful approval', async () => {
      mockService.approveToolCall.mockReturnValue(true);

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/approve')
        .send({ proposalId: 'p1' });

      expect(res.status).toBe(200);
      expect(res.body.approved).toBe(true);
      expect(mockService.approveToolCall).toHaveBeenCalledWith('s1', 'p1');
    });

    it('returns 404 when proposal not found', async () => {
      mockService.approveToolCall.mockReturnValue(false);

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/approve')
        .send({ proposalId: 'p-missing' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions/:sessionId/reject', () => {
    it('returns 400 when proposalId is missing', async () => {
      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/reject')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 200 on successful rejection', async () => {
      mockService.rejectToolCall.mockReturnValue(true);

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/reject')
        .send({ proposalId: 'p1', reason: 'Not safe' });

      expect(res.status).toBe(200);
      expect(res.body.approved).toBe(false);
      expect(mockService.rejectToolCall).toHaveBeenCalledWith('s1', 'p1', 'Not safe');
    });

    it('returns 404 when proposal not found', async () => {
      mockService.rejectToolCall.mockReturnValue(false);

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/reject')
        .send({ proposalId: 'p-gone' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions/:sessionId/restart', () => {
    it('restarts session successfully', async () => {
      mockService.clearAndRestartSession.mockResolvedValue({
        sessionId: 's-new',
        ruleId: 'R1',
        analysisRunId: 'run1',
        status: 'ACTIVE',
        resumed: false,
        messages: [],
      });

      const res = await request(app)
        .post('/api/chat-fix/sessions/s1/restart');

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('s-new');
      expect(mockService.clearAndRestartSession).toHaveBeenCalledWith('s1');
    });

    it('forwards 404 from service', async () => {
      mockService.clearAndRestartSession.mockRejectedValue(
        Object.assign(new Error('Session not found'), { statusCode: 404 }),
      );

      const res = await request(app)
        .post('/api/chat-fix/sessions/nonexistent/restart');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /sessions/:sessionId', () => {
    it('closes session successfully', async () => {
      mockService.closeSession.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/chat-fix/sessions/s1');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockService.closeSession).toHaveBeenCalledWith('s1');
    });
  });
});
