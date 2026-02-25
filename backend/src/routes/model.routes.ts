import { Router } from 'express';
import { listModels, getModel, getModelRuns, deleteModel } from '../services/model.service.js';
import { createError } from '../middleware/errorHandler.js';

export const modelRouter = Router();

/**
 * @openapi
 * /api/models:
 *   get:
 *     summary: List all tracked semantic models with run counts
 *     tags: [Models]
 *     responses:
 *       200:
 *         description: List of semantic models
 */
modelRouter.get('/', async (_req, res, next) => {
  try {
    const models = await listModels();
    res.json(models);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/models/{databaseName}:
 *   get:
 *     summary: Get a specific semantic model with its analysis runs
 *     tags: [Models]
 *     parameters:
 *       - in: path
 *         name: databaseName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Semantic model details
 *       404:
 *         description: Model not found
 */
modelRouter.get('/:databaseName', async (req, res, next) => {
  try {
    const model = await getModel(req.params.databaseName);
    if (!model) {
      throw createError(404, 'Semantic model not found');
    }
    res.json(model);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/models/{databaseName}/runs:
 *   get:
 *     summary: List analysis runs for a specific semantic model
 *     tags: [Models]
 *     parameters:
 *       - in: path
 *         name: databaseName
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Paginated list of analysis runs for this model
 */
modelRouter.get('/:databaseName/runs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getModelRuns(req.params.databaseName, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/models/{databaseName}:
 *   delete:
 *     summary: Delete a semantic model and all its analysis runs (cascade)
 *     tags: [Models]
 *     parameters:
 *       - in: path
 *         name: databaseName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model deleted
 *       404:
 *         description: Model not found
 */
modelRouter.delete('/:databaseName', async (req, res, next) => {
  try {
    await deleteModel(req.params.databaseName);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
