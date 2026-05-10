export interface RouteConfig {
  path: string;
  targets: string[];
  strategy: 'round-robin' | 'random' | 'least-connections';
  auth?: AuthConfig;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  timeout?: number;       // ms
  stripPrefix?: boolean;
  addHeaders?: Record<string, string>;
  removeHeaders?: string[];
}

export interface AuthConfig {
  required: boolean;
  secret?: string;
  allowedRoles?: string[];
}

export interface RateLimitConfig {
  windowMs: number;       // sliding window in ms
  maxRequests: number;    // max requests per window per key
  keyBy: 'ip' | 'user' | 'api-key';
}

export interface CircuitBreakerConfig {
  threshold: number;      // failure count before opening
  timeout: number;        // ms before attempting half-open
  successThreshold: number; // successes to close from half-open
}

export interface GatewayConfig {
  port: number;
  routes: RouteConfig[];
  globalRateLimit?: RateLimitConfig;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  corsOrigins?: string[];
  jwtSecret: string;
}

export interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  roles?: string[];
  route?: RouteConfig;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  successes: number;
}

export interface HealthStatus {
  target: string;
  healthy: boolean;
  latencyMs: number;
  lastCheck: string;
}

export interface GatewayStats {
  totalRequests: number;
  totalErrors: number;
  totalLatencyMs: number;
  routes: RouteStats[];
  circuitBreakers: Record<string, CircuitBreakerState>;
  uptime: string;
  startTime: string;
}

export interface RouteStats {
  path: string;
  requests: number;
  errors: number;
  avgLatencyMs: number;
}
