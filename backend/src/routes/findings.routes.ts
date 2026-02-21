import { Router } from 'express';
import { getFindings, getFinding } from '../services/analysis.service.js';
import { createError } from '../middleware/errorHandler.js';

export const findingsRouter = Router();

/**
 * @openapi
 * /api/analysis/runs/{runId}/findings:
 *   get:
 *     summary: List findings for an analysis run
 *     tags: [Findings]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: severity
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3]
 *         description: 'Filter by severity: 1=Info, 2=Warning, 3=Error'
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Performance, DAX Expressions, Error Prevention, Maintenance, Naming Conventions, Formatting]
 *       - in: query
 *         name: fixStatus
 *         schema:
 *           type: string
 *           enum: [UNFIXED, IN_PROGRESS, FIXED, FAILED]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [severity, category, fixStatus, createdAt]
 *           default: severity
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of findings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 findings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Finding'
 *                 summary:
 *                   $ref: '#/components/schemas/FindingSummary'
 *                 total:
 *                   type: integer
 */
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

/**
 * @openapi
 * /api/findings/{findingId}:
 *   get:
 *     summary: Get a specific finding with fix details
 *     tags: [Findings]
 *     parameters:
 *       - in: path
 *         name: findingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Finding details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Finding'
 *       404:
 *         description: Finding not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
