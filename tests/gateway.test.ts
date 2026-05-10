import { RateLimiter } from '../src/middleware/rateLimit';
import { CircuitBreaker } from '../src/middleware/circuitBreaker';
import { LoadBalancer } from '../src/proxy/loadBalancer';
import { RouteConfig } from '../src/types';

// ---- RateLimiter Tests ----

describe('RateLimiter', () => {
  test('allows requests within limit', () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5, keyBy: 'ip' });
    const middleware = limiter.middleware();
    let allowedCount = 0;

    for (let i = 0; i < 5; i++) {
      const req: any = {
        headers: {},
        socket: { remoteAddress: '1.2.3.4' },
        query: {},
        ctx: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();
      middleware(req, res, next);
      if (next.mock.calls.length > 0) allowedCount++;
    }

    expect(allowedCount).toBe(5);
    limiter.destroy();
  });

  test('blocks requests over limit', () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2, keyBy: 'ip' });
    const middleware = limiter.middleware();
    let blocked = false;

    for (let i = 0; i < 4; i++) {
      const req: any = {
        headers: {},
        socket: { remoteAddress: '9.9.9.9' },
        query: {},
        ctx: {},
      };
      let status = 200;
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockImplementation((s) => { status = s; return res; }),
        json: jest.fn(),
      };
      const next = jest.fn();
      middleware(req, res, next);
      if (status === 429) blocked = true;
    }

    expect(blocked).toBe(true);
    limiter.destroy();
  });
});

// ---- CircuitBreaker Tests ----

describe('CircuitBreaker', () => {
  test('starts closed and allows requests', () => {
    const cb = new CircuitBreaker('test', { threshold: 3, timeout: 5000, successThreshold: 2 });
    expect(cb.canRequest()).toBe(true);
    expect(cb.getState().state).toBe('closed');
  });

  test('opens after threshold failures', () => {
    const cb = new CircuitBreaker('test-open', { threshold: 3, timeout: 5000, successThreshold: 2 });
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState().state).toBe('open');
    expect(cb.canRequest()).toBe(false);
  });

  test('transitions to half-open after timeout', () => {
    const cb = new CircuitBreaker('test-halfopen', { threshold: 1, timeout: 1, successThreshold: 1 });
    cb.onFailure(); // open
    expect(cb.getState().state).toBe('open');

    // Wait for timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.canRequest()).toBe(true); // should be half-open now
        resolve();
      }, 10);
    });
  });

  test('closes after success threshold in half-open', () => {
    const cb = new CircuitBreaker('test-close', { threshold: 1, timeout: 1, successThreshold: 2 });
    cb.onFailure();

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.canRequest(); // trigger half-open
        cb.onSuccess();
        cb.onSuccess();
        expect(cb.getState().state).toBe('closed');
        resolve();
      }, 10);
    });
  });
});

// ---- LoadBalancer Tests ----

describe('LoadBalancer', () => {
  const makeRoute = (strategy: RouteConfig['strategy'], targets: string[]): RouteConfig => ({
    path: '/test',
    targets,
    strategy,
  });

  test('round-robin cycles through targets', () => {
    const lb = new LoadBalancer();
    const route = makeRoute('round-robin', ['a', 'b', 'c']);

    const selections = [lb.selectTarget(route), lb.selectTarget(route), lb.selectTarget(route)];
    expect(selections).toContain('a');
    expect(selections).toContain('b');
    expect(selections).toContain('c');
  });

  test('random returns a valid target', () => {
    const lb = new LoadBalancer();
    const route = makeRoute('random', ['x', 'y', 'z']);

    for (let i = 0; i < 20; i++) {
      const t = lb.selectTarget(route);
      expect(['x', 'y', 'z']).toContain(t);
    }
  });

  test('least-connections picks target with fewest connections', () => {
    const lb = new LoadBalancer();
    const route = makeRoute('least-connections', ['s1', 's2', 's3']);

    lb.incrementConnections('s1');
    lb.incrementConnections('s1');
    lb.incrementConnections('s2');
    // s3 has 0 connections — should be selected

    const selected = lb.selectTarget(route);
    expect(selected).toBe('s3');
  });

  test('single target always returns that target', () => {
    const lb = new LoadBalancer();
    const route = makeRoute('round-robin', ['only-one']);
    for (let i = 0; i < 5; i++) {
      expect(lb.selectTarget(route)).toBe('only-one');
    }
  });
});
