import { Router } from 'express';
import { getInstances, connect, disconnect, getStatus } from '../services/connection.service.js';
import { healthCheck } from '../mcp/client.js';
import { createError } from '../middleware/errorHandler.js';

export const connectionRouter = Router();

connectionRouter.get('/instances', async (_req, res, next) => {
  try {
    const result = await getInstances();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

connectionRouter.post('/connect', async (req, res, next) => {
  try {
    const { serverAddress, databaseName } = req.body;
    if (!serverAddress || !databaseName) {
      throw createError(400, 'serverAddress and databaseName are required');
    }
    const result = await connect(serverAddress, databaseName);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

connectionRouter.get('/status', (_req, res) => {
  const status = getStatus();
  res.json(status);
});

connectionRouter.get('/health', async (_req, res) => {
  const healthy = await healthCheck();
  res.json({ healthy });
});

connectionRouter.post('/disconnect', async (_req, res, next) => {
  try {
    const result = await disconnect();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
