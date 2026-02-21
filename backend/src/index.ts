import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { spec } from './swagger.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'incoming request');
  next();
});

registerRoutes(app);

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

export default app;
