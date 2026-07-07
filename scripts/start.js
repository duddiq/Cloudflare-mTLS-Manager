import { spawn } from 'child_process';

console.log('Starting Wrangler Pages server in production mode...');

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const wrangler = spawn('npx wrangler pages dev dist --port 3000 --ip 0.0.0.0', { stdio: 'inherit', env, shell: true });

const cleanup = () => {
  wrangler.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
