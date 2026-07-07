import fs from 'fs';

console.log('Cleaning build artifacts...');

if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

console.log('Cleanup complete.');
