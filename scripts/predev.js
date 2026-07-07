import fs from 'fs';
import path from 'path';

console.log('Running predev setup...');

// Ensure dist directory exists (equivalent to mkdir -p dist)
fs.mkdirSync('dist', { recursive: true });

// Copy index.html to dist/index.html (equivalent to cp index.html dist/index.html)
fs.copyFileSync('index.html', 'dist/index.html');

// Remove dist/assets if it exists (equivalent to rm -rf dist/assets)
const assetsPath = path.join('dist', 'assets');
if (fs.existsSync(assetsPath)) {
  fs.rmSync(assetsPath, { recursive: true, force: true });
}

console.log('Predev setup completed successfully.');
