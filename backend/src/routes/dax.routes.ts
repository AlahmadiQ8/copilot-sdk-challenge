import { Router } from 'express';
import { executeDax, validateDax, getDaxQuery, getDaxHistory, cancelDaxQuery } from '../services/dax.service.js';
import { generateDax } from '../services/dax-generation.service.js';

export const daxRouter = Router();

// POST /dax/execute — Execute a DAX query
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

// POST /dax/generate — Generate DAX from natural language
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

// GET /dax/history — List query history
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

// POST /dax/:queryId/cancel — Cancel a running query
daxRouter.post('/:queryId/cancel', async (req, res, next) => {
  try {
    const queryId = req.params.queryId as string;
    await cancelDaxQuery(queryId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
