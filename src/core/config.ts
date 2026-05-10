import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { GatewayConfig } from '../types';

const DEFAULT_CONFIG: Partial<GatewayConfig> = {
  port: 8000,
  logLevel: 'info',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  corsOrigins: ['*'],
  routes: [],
};

export function loadConfig(configPath?: string): GatewayConfig {
  const resolved = configPath
    ? path.resolve(configPath)
    : path.resolve(process.cwd(), 'config', 'routes.yaml');

  if (!fs.existsSync(resolved)) {
    console.warn(`[meridian] Config not found at ${resolved}, using defaults`);
    return { ...DEFAULT_CONFIG } as GatewayConfig;
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = yaml.load(raw) as Partial<GatewayConfig>;

  const config: GatewayConfig = {
    ...DEFAULT_CONFIG,
    ...parsed,
  } as GatewayConfig;

  validateConfig(config);
  return config;
}

function validateConfig(config: GatewayConfig): void {
  if (!config.routes || !Array.isArray(config.routes)) {
    throw new Error('Config must define a "routes" array');
  }

  for (const route of config.routes) {
    if (!route.path) throw new Error(`Route missing "path"`);
    if (!route.targets || route.targets.length === 0) {
      throw new Error(`Route "${route.path}" must have at least one target`);
    }
  }
}
