import { Router } from 'express';
import { getFindings, getFinding } from '../services/analysis.service.js';
import { createError } from '../middleware/errorHandler.js';

export const findingsRouter = Router();

findingsRouter.get('/analysis/runs/:runId/findings', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const severity = req.query.severity ? parseInt(req.query.severity as string) : undefined;
    const category = req.query.category as string | undefined;
    const fixStatus = req.query.fixStatus as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'severity';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getFindings(runId, {
      severity,
      category,
      fixStatus,
      sortBy,
      sortOrder,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

findingsRouter.get('/findings/:findingId', async (req, res, next) => {
  try {
    const finding = await getFinding(req.params.findingId);
    if (!finding) {
      throw createError(404, 'Finding not found');
    }
    res.json(finding);
  } catch (err) {
    next(err);
  }
});
