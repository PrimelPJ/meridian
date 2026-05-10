# Meridian — API Gateway

> Production-grade API Gateway in TypeScript — JWT auth, token-bucket rate limiting, circuit breaker, and multi-strategy load balancing. Configured entirely from a YAML file.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)](LICENSE)

## Architecture

```
Client
  │
  ▼
┌─────────────────────────────────────────────────┐
│              Meridian Gateway (:8000)           │
│                                                 │
│  requestLogger ──► CORS ──► GlobalRateLimit     │
│                                                 │
│  Route Matcher                                  │
│   ├── JWT Auth middleware                       │
│   ├── Per-route Rate Limiter (token bucket)     │
│   ├── Stats tracker                             │
│   └── Proxy engine                              │
│         ├── Circuit Breaker                     │
│         ├── Load Balancer (RR / random / LC)    │
│         └── http-proxy-middleware               │
└─────────────────────────────────────────────────┘
       │              │              │
  Service A      Service B      Service C
```

## Features

| Feature | Detail |
|---|---|
| JWT Authentication | Bearer token validation with RBAC role checks |
| Rate Limiting | Token-bucket algorithm, keyed by IP / user / API key |
| Circuit Breaker | Closed → Open → Half-Open state machine |
| Load Balancing | Round-robin, random, least-connections |
| Header Manipulation | Add / remove / rewrite headers per route |
| Structured Logging | JSON logs via Winston with request ID tracing |
| Stats API | `/gateway/stats` — requests, errors, p50 latency per route |
| YAML Config | Zero-code route definition |

## Quick Start

```bash
# Install dependencies
npm install

# Set your JWT secret
export JWT_SECRET=super-secret

# Start in development mode
npm run dev

# Or with Docker
docker-compose up
```

## Configuration (`config/routes.yaml`)

```yaml
port: 8000
jwtSecret: "${JWT_SECRET}"

globalRateLimit:
  windowMs: 60000
  maxRequests: 1000
  keyBy: ip

routes:
  - path: /api/users
    targets:
      - http://user-service:3002
      - http://user-service-2:3002
    strategy: round-robin
    auth:
      required: true
    circuitBreaker:
      threshold: 5
      timeout: 30000
      successThreshold: 2
```

## Available Endpoints

| Endpoint | Description |
|---|---|
| `GET /healthz` | Liveness check |
| `GET /gateway/stats` | Per-route metrics |
| `GET /gateway/routes` | Registered route listing |

## JWT Token Generation

```js
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'user-123', roles: ['admin'] },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
```

## Load Balancing Strategies

- `round-robin` — sequential, even distribution (default)
- `random` — stateless, good for stateless services
- `least-connections` — routes to backend with fewest in-flight requests

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Gateway port |
| `JWT_SECRET` | — | Secret for JWT verification |
| `MERIDIAN_CONFIG` | `config/routes.yaml` | Path to config file |
| `LOG_LEVEL` | `info` | Winston log level |

## Running Tests

```bash
npm test
```

## License

All Rights Reserved © Primel Jayawardana
