import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/error.js';
import { adminRoutes } from './routes/admin.js';
import { affiliateRoutes } from './routes/affiliate.js';
import { publicRoutes } from './routes/public.js';
import { buildServices, type Deps } from './services/index.js';

export function createApp(deps: Deps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);
  app.use(helmet());

  const origins = new Set(deps.config.frontendOrigins);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'x-webhook-secret'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '50kb' }));

  const services = buildServices(deps);
  const api = express.Router();
  api.use(publicRoutes(deps, services));
  api.use(affiliateRoutes(deps, services));
  api.use(adminRoutes(deps, services));

  app.get('/health', (_req, res) => void res.json({ ok: true }));
  app.use('/api/v1', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
