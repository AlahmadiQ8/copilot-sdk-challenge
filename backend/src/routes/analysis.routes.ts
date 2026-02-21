import { Router } from 'express';
import {
  runAnalysis,
  getAnalysisRun,
  listAnalysisRuns,
  compareRuns,
} from '../services/analysis.service.js';
import { createError } from '../middleware/errorHandler.js';

export const analysisRouter = Router();

/**
 * @openapi
 * /api/analysis/run:
 *   post:
 *     summary: Run best practices analysis on connected model
 *     tags: [Analysis]
 *     responses:
 *       200:
 *         description: Analysis started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalysisRun'
 *       409:
 *         description: Analysis already in progress
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
analysisRouter.post('/run', async (_req, res, next) => {
  try {
    const runId = await runAnalysis();
    const run = await getAnalysisRun(runId);
    res.json(run);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/analysis/runs:
 *   get:
 *     summary: List all analysis runs
 *     tags: [Analysis]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of analysis runs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 runs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AnalysisRun'
 *                 total:
 *                   type: integer
 */
analysisRouter.get('/runs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await listAnalysisRuns(limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/analysis/runs/{runId}:
 *   get:
 *     summary: Get a specific analysis run with its findings
 *     tags: [Analysis]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis run details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalysisRun'
 *       404:
 *         description: Run not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
analysisRouter.get('/runs/:runId', async (req, res, next) => {
  try {
    const run = await getAnalysisRun(req.params.runId);
    if (!run) {
      throw createError(404, 'Analysis run not found');
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/analysis/runs/{runId}/compare/{previousRunId}:
 *   get:
 *     summary: Compare two analysis runs
 *     tags: [Analysis]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: previousRunId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comparison between two analysis runs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Run not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
analysisRouter.get('/runs/:runId/compare/:previousRunId', async (req, res, next) => {
  try {
    const comparison = await compareRuns(req.params.runId, req.params.previousRunId);
    res.json(comparison);
  } catch (err) {
    next(err);
  }
});
