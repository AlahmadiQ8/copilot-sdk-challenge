import { Router } from 'express';
import {
  runAnalysis,
  getAnalysisRun,
  listAnalysisRuns,
  compareRuns,
} from '../services/analysis.service.js';
import { createError } from '../middleware/errorHandler.js';

export const analysisRouter = Router();

analysisRouter.post('/run', async (_req, res, next) => {
  try {
    const runId = await runAnalysis();
    const run = await getAnalysisRun(runId);
    res.json(run);
  } catch (err) {
    next(err);
  }
});

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

analysisRouter.get('/runs/:runId/compare/:previousRunId', async (req, res, next) => {
  try {
    const comparison = await compareRuns(req.params.runId, req.params.previousRunId);
    res.json(comparison);
  } catch (err) {
    next(err);
  }
});
