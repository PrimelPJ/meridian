import express, { Request, Response } from 'express';
import { GatewayConfig } from '../types';
import { loadConfig } from './config';
import { createAuthMiddleware } from '../middleware/auth';
import { RateLimiter } from '../middleware/rateLimit';
import { requestLogger, logger } from '../middleware/logger';
import { ProxyEngine } from '../proxy/proxy';
import { StatsTracker } from './stats';

export class Gateway {
  private app = express();
  private config: GatewayConfig;
  private proxy = new ProxyEngine();
  private stats = new StatsTracker();

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
    this.setup();
  }

  private setup(): void {
    const { config } = this;

    // Trust proxies (needed for correct IP extraction behind load balancers)
    this.app.set('trust proxy', true);

    // Global middleware
    this.app.use(requestLogger());

    // CORS
    this.app.use((req, res, next) => {
      const origins = config.corsOrigins ?? ['*'];
      const origin = req.headers.origin || '';
      if (origins.includes('*') || origins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // Global rate limiter
    if (config.globalRateLimit) {
      const globalLimiter = new RateLimiter(config.globalRateLimit);
      this.app.use(globalLimiter.middleware());
    }

    // Built-in routes
    this.app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
    this.app.get('/gateway/stats', (_req, res) => {
      res.json(this.stats.snapshot(this.proxy.getBreakerStates()));
    });
    this.app.get('/gateway/routes', (_req, res) => {
      res.json({ routes: config.routes.map((r) => ({ path: r.path, targets: r.targets })) });
    });

    // Dynamic route registration
    for (const route of config.routes) {
      const routeLimiters: express.RequestHandler[] = [];

      if (route.rateLimit) {
        const limiter = new RateLimiter(route.rateLimit);
        routeLimiters.push(limiter.middleware() as express.RequestHandler);
      }

      const authMiddleware = createAuthMiddleware(config.jwtSecret, route.auth);
      const proxyHandler = this.proxy.buildProxy(route);

      this.app.use(
        route.path,
        authMiddleware,
        ...routeLimiters,
        this.statsMiddleware(route.path),
        proxyHandler
      );

      logger.info(`[meridian] registered route ${route.path} → [${route.targets.join(', ')}]`);
    }

    // 404 fallback
    this.app.use((_req, res) => {
      res.status(404).json({ error: 'No matching gateway route' });
    });
  }

  private statsMiddleware(routePath: string) {
    return (req: Request, res: Response, next: express.NextFunction): void => {
      const start = Date.now();
      res.on('finish', () => {
        this.stats.record(routePath, Date.now() - start, res.statusCode >= 500);
      });
      next();
    };
  }

  listen(): void {
    const port = this.config.port;
    this.app.listen(port, () => {
      logger.info(`Meridian API Gateway running on port ${port}`);
      logger.info(`Routes configured: ${this.config.routes.length}`);
    });
  }

  getApp() {
    return this.app;
  }
}
