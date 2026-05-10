import { CircuitBreakerConfig, CircuitBreakerState } from '../types';

/**
 * Classic three-state circuit breaker: closed → open → half-open → closed.
 *
 *  CLOSED    — requests pass through; failures are counted
 *  OPEN      — requests are immediately rejected for `timeout` ms
 *  HALF-OPEN — a probe request is allowed; success closes, failure re-opens
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'closed',
    failures: 0,
    lastFailure: 0,
    successes: 0,
  };

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  /** Returns true if the request should be allowed through */
  canRequest(): boolean {
    const now = Date.now();

    if (this.state.state === 'closed') return true;

    if (this.state.state === 'open') {
      if (now - this.state.lastFailure >= this.config.timeout) {
        this.state.state = 'half-open';
        this.state.successes = 0;
        return true; // allow one probe
      }
      return false;
    }

    // half-open: allow one request at a time
    return true;
  }

  onSuccess(): void {
    if (this.state.state === 'half-open') {
      this.state.successes++;
      if (this.state.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.state.state === 'closed') {
      // Decay failures on success
      if (this.state.failures > 0) this.state.failures--;
    }
  }

  onFailure(): void {
    this.state.failures++;
    this.state.lastFailure = Date.now();

    if (
      this.state.state === 'half-open' ||
      this.state.failures >= this.config.threshold
    ) {
      this.trip();
    }
  }

  getState(): Readonly<CircuitBreakerState> {
    return { ...this.state };
  }

  private trip(): void {
    this.state.state = 'open';
    this.state.successes = 0;
    console.warn(`[meridian] Circuit breaker tripped for: ${this.name}`);
  }

  private reset(): void {
    this.state = { state: 'closed', failures: 0, lastFailure: 0, successes: 0 };
    console.info(`[meridian] Circuit breaker closed for: ${this.name}`);
  }
}
