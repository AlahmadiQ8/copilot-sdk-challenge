import { Router } from 'express';
import { getRulesForApi } from '../services/rules.service.js';

export const rulesRouter = Router();

/**
 * @openapi
 * /api/rules:
 *   get:
 *     summary: List all BPA rules
 *     tags: [Rules]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of BPA rules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rules:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BpaRule'
 */
rulesRouter.get('/', async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const rules = await getRulesForApi(category);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});
