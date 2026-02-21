import { Router } from 'express';
import { executeDax, validateDax, getDaxQuery, getDaxHistory, cancelDaxQuery } from '../services/dax.service.js';
import { generateDax } from '../services/dax-generation.service.js';

export const daxRouter = Router();

/**
 * @openapi
 * /api/dax/execute:
 *   post:
 *     summary: Execute a DAX query against the connected model
 *     tags: [DAX Queries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DaxQueryRequest'
 *     responses:
 *       200:
 *         description: Query result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DaxQueryResult'
 *       400:
 *         description: Invalid DAX query
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: No model connected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
daxRouter.post('/execute', async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }
    const queryId = await executeDax(query);

    // Poll for completion
    let result = await getDaxQuery(queryId);
    for (let i = 0; i < 20 && result.status === 'RUNNING'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await getDaxQuery(queryId);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/dax/generate:
 *   post:
 *     summary: Generate a DAX query from natural language using AI
 *     tags: [DAX Queries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DaxGenerateRequest'
 *     responses:
 *       200:
 *         description: Generated DAX query
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                   description: Generated DAX query
 *                 explanation:
 *                   type: string
 *                   description: AI explanation of the query
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
daxRouter.post('/generate', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const result = await generateDax(prompt);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/dax/history:
 *   get:
 *     summary: Get DAX query execution history
 *     tags: [DAX Queries]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Query history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DaxQueryHistoryItem'
 */
daxRouter.get('/history', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getDaxHistory(limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/dax/{queryId}/cancel:
 *   post:
 *     summary: Cancel a running DAX query
 *     tags: [DAX Queries]
 *     parameters:
 *       - in: path
 *         name: queryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Query cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       404:
 *         description: Query not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Query not running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
daxRouter.post('/:queryId/cancel', async (req, res, next) => {
  try {
    const queryId = req.params.queryId as string;
    await cancelDaxQuery(queryId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
