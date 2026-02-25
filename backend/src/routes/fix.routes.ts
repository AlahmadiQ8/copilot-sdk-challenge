import { Router, Request, Response, NextFunction } from 'express';
import { applyTeFix, applyBulkTeFix } from '../services/fix.service.js';

export const fixRouter = Router();

/**
 * @openapi
 * /api/findings/{findingId}/te-fix:
 *   post:
 *     summary: Apply Tabular Editor fix for a single finding
 *     tags: [Fix]
 *     parameters:
 *       - in: path
 *         name: findingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fix applied successfully
 *       404:
 *         description: Finding not found
 *       409:
 *         description: Finding already fixed
 *       422:
 *         description: Fix cannot be applied (no fix expression, unsupported type, or not connected)
 */
fixRouter.post('/findings/:findingId/te-fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await applyTeFix(req.params.findingId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/rules/{ruleId}/te-fix-all:
 *   post:
 *     summary: Apply Tabular Editor fix to all unfixed findings of a rule
 *     tags: [Fix]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [analysisRunId]
 *             properties:
 *               analysisRunId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bulk TE fix completed
 *       404:
 *         description: No unfixed findings for this rule
 *       422:
 *         description: Cannot apply fix (no connection, no FixExpression, etc.)
 */
fixRouter.post('/rules/:ruleId/te-fix-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const { analysisRunId } = req.body;
    if (!analysisRunId) {
      res.status(400).json({ error: 'analysisRunId is required' });
      return;
    }
    const result = await applyBulkTeFix(ruleId, analysisRunId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});


