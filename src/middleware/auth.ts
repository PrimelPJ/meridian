import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthConfig, RequestContext } from '../types';

export interface AuthenticatedRequest extends Request {
  ctx: RequestContext;
}

export function createAuthMiddleware(secret: string, routeAuth?: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    // If auth not required for this route, skip
    if (!routeAuth?.required) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.query.token as string);

    if (!token) {
      res.status(401).json({ error: 'Missing authentication token' });
      return;
    }

    const routeSecret = routeAuth.secret || secret;

    try {
      const decoded = jwt.verify(token, routeSecret) as jwt.JwtPayload;

      // Attach to request context
      authReq.ctx = {
        ...authReq.ctx,
        userId: decoded.sub || decoded.userId,
        roles: decoded.roles || [],
      };

      // Role-based access control
      if (routeAuth.allowedRoles && routeAuth.allowedRoles.length > 0) {
        const userRoles: string[] = authReq.ctx.roles || [];
        const hasRole = routeAuth.allowedRoles.some((r) => userRoles.includes(r));
        if (!hasRole) {
          res.status(403).json({
            error: 'Forbidden: insufficient role',
            required: routeAuth.allowedRoles,
          });
          return;
        }
      }

      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired' });
      } else if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
      } else {
        res.status(500).json({ error: 'Auth error' });
      }
    }
  };
}
