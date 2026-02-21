import type { Express } from 'express';
import { connectionRouter } from './connection.routes.js';
import { analysisRouter } from './analysis.routes.js';
import { findingsRouter } from './findings.routes.js';
import { rulesRouter } from './rules.routes.js';
import { fixRouter } from './fix.routes.js';
import { daxRouter } from './dax.routes.js';

export function registerRoutes(app: Express) {
  app.use('/api/connection', connectionRouter);
  app.use('/api/analysis', analysisRouter);
  app.use('/api', findingsRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api', fixRouter);
  app.use('/api/dax', daxRouter);
}
