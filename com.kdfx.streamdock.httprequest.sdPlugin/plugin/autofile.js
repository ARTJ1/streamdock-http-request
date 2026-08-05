const path = require('path');
const fs = require('fs-extra');

const currentDir = __dirname;
const parentDir = path.join(currentDir, '..');
const PluginName = path.basename(parentDir);
const PluginPath = path.join(process.env.APPDATA, 'HotSpot', 'StreamDock', 'plugins', PluginName);
const isDev = process.argv.includes('--dev');

function shouldCopy(src) {
  const relativePath = path.relative(parentDir, src).replace(/\//g, '\\');
  if (!relativePath) return true;

  const blocked = [
    'plugin\\build',
    'plugin\\log',
    '.git',
    '.vscode'
  ];

  if (isDev) {
    // keep node_modules so Stream Dock can require('ws') / log4js
  } else {
    blocked.push(
      'plugin\\node_modules',
      'plugin\\index.js',
      'plugin\\package.json',
      'plugin\\package-lock.json',
      'plugin\\pnpm-lock.yaml',
      'plugin\\yarn.lock',
      'plugin\\utils',
      'plugin\\autofile.js'
    );
  }

  return !blocked.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix + '\\'));
}

console.log(isDev ? 'Dev install...' : 'Production build install...');

try {
  fs.removeSync(PluginPath);
  fs.ensureDirSync(path.dirname(PluginPath));
  fs.copySync(parentDir, PluginPath, { filter: shouldCopy });

  if (!isDev) {
    const buildDir = path.join(currentDir, 'build');
    if (!fs.existsSync(buildDir)) {
      throw new Error('Missing plugin/build. Run: npm run build');
    }
    fs.copySync(buildDir, path.join(PluginPath, 'plugin'));
  }

  console.log(`Installed: ${PluginPath}`);
  console.log('Restart Stream Dock / AJAZZ software to load the plugin.');
} catch (err) {
  console.error(`Install failed for "${PluginName}":`, err);
  process.exit(1);
}
