import { GatewayStats, RouteStats } from '../types';

interface RouteMetrics {
  requests: number;
  errors: number;
  totalLatencyMs: number;
}

export class StatsTracker {
  private startTime = new Date();
  private totalRequests = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;
  private routeMetrics = new Map<string, RouteMetrics>();

  record(route: string, latencyMs: number, isError: boolean): void {
    this.totalRequests++;
    this.totalLatencyMs += latencyMs;
    if (isError) this.totalErrors++;

    const rm = this.routeMetrics.get(route) ?? {
      requests: 0, errors: 0, totalLatencyMs: 0,
    };
    rm.requests++;
    rm.totalLatencyMs += latencyMs;
    if (isError) rm.errors++;
    this.routeMetrics.set(route, rm);
  }

  snapshot(
    breakerStates: Record<string, unknown>
  ): GatewayStats {
    const routes: RouteStats[] = [];
    for (const [path, rm] of this.routeMetrics) {
      routes.push({
        path,
        requests: rm.requests,
        errors: rm.errors,
        avgLatencyMs:
          rm.requests > 0
            ? Math.round(rm.totalLatencyMs / rm.requests)
            : 0,
      });
    }

    const uptimeMs = Date.now() - this.startTime.getTime();
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalLatencyMs: this.totalLatencyMs,
      routes,
      circuitBreakers: breakerStates as GatewayStats['circuitBreakers'],
      uptime: `${h}h ${m}m ${s}s`,
      startTime: this.startTime.toISOString(),
    };
  }
}
