import { watch } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'public', 'performances.json');

let running = false;
let queued = false;

function runBuild() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  const child = spawn(process.execPath, ['scripts/build-performances.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  child.on('exit', () => {
    running = false;
    if (queued) {
      queued = false;
      runBuild();
    }
  });
}

console.log('Watching public/performances.json for changes...');
watch(SOURCE_PATH, { persistent: true }, () => {
  runBuild();
});
