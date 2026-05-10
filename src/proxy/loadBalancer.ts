import { RouteConfig } from '../types';

/**
 * Selects a backend target using the configured strategy.
 * Tracks in-flight connection counts for least-connections.
 */
export class LoadBalancer {
  private counters = new Map<string, number>(); // round-robin counters
  private connections = new Map<string, number>(); // active connection counts

  selectTarget(route: RouteConfig): string {
    const targets = route.targets;
    if (targets.length === 1) return targets[0];

    switch (route.strategy ?? 'round-robin') {
      case 'random':
        return targets[Math.floor(Math.random() * targets.length)];

      case 'least-connections': {
        let min = Infinity;
        let selected = targets[0];
        for (const t of targets) {
          const c = this.connections.get(t) ?? 0;
          if (c < min) {
            min = c;
            selected = t;
          }
        }
        return selected;
      }

      case 'round-robin':
      default: {
        const key = route.path;
        const idx = (this.counters.get(key) ?? 0) % targets.length;
        this.counters.set(key, idx + 1);
        return targets[idx];
      }
    }
  }

  incrementConnections(target: string): void {
    this.connections.set(target, (this.connections.get(target) ?? 0) + 1);
  }

  decrementConnections(target: string): void {
    const c = this.connections.get(target) ?? 0;
    this.connections.set(target, Math.max(0, c - 1));
  }
}
