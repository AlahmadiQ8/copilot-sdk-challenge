import { Router } from 'express';
import { getInstances, connect, disconnect, getStatus } from '../services/connection.service.js';
import { healthCheck } from '../mcp/client.js';
import { createError } from '../middleware/errorHandler.js';

export const connectionRouter = Router();

/**
 * @openapi
 * /api/connection/instances:
 *   get:
 *     summary: List local Power BI Desktop instances
 *     tags: [Connection]
 *     responses:
 *       200:
 *         description: List of available PBI Desktop instances
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PbiInstance'
 */
connectionRouter.get('/instances', async (_req, res, next) => {
  try {
    const result = await getInstances();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/connection/connect:
 *   post:
 *     summary: Connect to a Power BI Semantic Model
 *     tags: [Connection]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConnectRequest'
 *     responses:
 *       200:
 *         description: Connection established
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConnectionStatus'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       502:
 *         description: Cannot reach Power BI Desktop
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @openapi
 * /api/connection/status:
 *   get:
 *     summary: Get current connection status
 *     tags: [Connection]
 *     responses:
 *       200:
 *         description: Current connection status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConnectionStatus'
 */
connectionRouter.get('/status', (_req, res) => {
  const status = getStatus();
  res.json(status);
});

/**
 * @openapi
 * /api/connection/health:
 *   get:
 *     summary: Check MCP server health
 *     tags: [Connection]
 *     responses:
 *       200:
 *         description: Health check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 */
connectionRouter.get('/health', async (_req, res) => {
  const healthy = await healthCheck();
  res.json({ healthy });
});

/**
 * @openapi
 * /api/connection/disconnect:
 *   post:
 *     summary: Disconnect from current Semantic Model
 *     tags: [Connection]
 *     responses:
 *       200:
 *         description: Disconnected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
connectionRouter.post('/disconnect', async (_req, res, next) => {
  try {
    const result = await disconnect();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
