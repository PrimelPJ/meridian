import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { RouteConfig } from '../types';
import { LoadBalancer } from './loadBalancer';
import { CircuitBreaker } from '../middleware/circuitBreaker';

/**
 * ProxyEngine builds per-route proxy middleware with circuit-breaker wrapping.
 */
export class ProxyEngine {
  private loadBalancer = new LoadBalancer();
  private breakers = new Map<string, CircuitBreaker>();

  buildProxy(route: RouteConfig) {
    const breaker = route.circuitBreaker
      ? this.getBreaker(route)
      : null;

    return (req: Request, res: Response, next: NextFunction): void => {
      // Circuit-breaker gate
      if (breaker && !breaker.canRequest()) {
        res.status(503).json({
          error: 'Service unavailable (circuit open)',
          route: route.path,
        });
        return;
      }

      const target = this.loadBalancer.selectTarget(route);
      this.loadBalancer.incrementConnections(target);

      // Header manipulation
      if (route.stripPrefix) {
        req.url = req.url.replace(new RegExp(`^${route.path}`), '') || '/';
      }
      if (route.addHeaders) {
        for (const [k, v] of Object.entries(route.addHeaders)) {
          req.headers[k.toLowerCase()] = v;
        }
      }
      if (route.removeHeaders) {
        for (const h of route.removeHeaders) {
          delete req.headers[h.toLowerCase()];
        }
      }

      const options: Options = {
        target,
        changeOrigin: true,
        timeout: route.timeout ?? 30_000,
        proxyTimeout: route.timeout ?? 30_000,
        on: {
          proxyReq: (_proxyReq, _req) => {
            (_req as Request).headers['x-forwarded-by'] = 'meridian';
          },
          proxyRes: (_proxyRes) => {
            this.loadBalancer.decrementConnections(target);
            breaker?.onSuccess();
          },
          error: (err, _req, res) => {
            this.loadBalancer.decrementConnections(target);
            breaker?.onFailure();
            console.error(`[meridian] proxy error → ${target}:`, err.message);
            if (!res.headersSent) {
              (res as Response).status(502).json({ error: 'Bad Gateway', target });
            }
          },
        },
      };

      createProxyMiddleware(options)(req, res, next);
    };
  }

  getBreakerStates(): Record<string, ReturnType<CircuitBreaker['getState']>> {
    const result: Record<string, ReturnType<CircuitBreaker['getState']>> = {};
    for (const [key, breaker] of this.breakers) {
      result[key] = breaker.getState();
    }
    return result;
  }

  private getBreaker(route: RouteConfig): CircuitBreaker {
    if (!this.breakers.has(route.path)) {
      this.breakers.set(
        route.path,
        new CircuitBreaker(route.path, route.circuitBreaker!)
      );
    }
    return this.breakers.get(route.path)!;
  }
}
