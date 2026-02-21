import { Router } from 'express';
import { getRulesForApi } from '../services/rules.service.js';

export const rulesRouter = Router();

rulesRouter.get('/', async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const rules = await getRulesForApi(category);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});
