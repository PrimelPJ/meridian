import { Gateway } from './core/gateway';

const configPath = process.env.MERIDIAN_CONFIG;
const gateway = new Gateway(configPath);
gateway.listen();

process.on('uncaughtException', (err) => {
  console.error('[meridian] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[meridian] Unhandled rejection:', reason);
  process.exit(1);
});
