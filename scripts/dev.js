import { spawn } from 'child_process';

console.log('Starting development servers...');

// Spawn Vite dev server
const devVite = spawn('npm run dev:vite', { stdio: 'inherit', shell: true });

// Spawn Wrangler Pages dev server
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const wrangler = spawn('npx wrangler pages dev --proxy http://127.0.0.1:5173 --port 3000 --ip 0.0.0.0', { stdio: 'inherit', env, shell: true });

// Handle termination of child processes when the main process exits
const cleanup = () => {
  console.log('\nStopping development servers...');
  devVite.kill();
  wrangler.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
