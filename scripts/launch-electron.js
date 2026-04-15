// launch-electron.js
// Sets ELECTRON_OVERRIDE_DIST_PATH from .electron-env then spawns electron
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.join(__dirname, '..');
const envFile = path.join(projectDir, '.electron-env');

if (!fs.existsSync(envFile)) {
  console.error('[ERR] .electron-env not found. Run "npm run setup" first.');
  process.exit(1);
}

const overridePath = fs.readFileSync(envFile, 'utf-8').trim();
process.env.ELECTRON_OVERRIDE_DIST_PATH = overridePath;

const electronBin = require('electron');
const result = spawnSync(electronBin, ['.'], {
  cwd: projectDir,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
