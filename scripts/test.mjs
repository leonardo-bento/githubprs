import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const output = await mkdtemp(path.join(tmpdir(), 'githubprs-tests-'));
try {
  const compilation = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc',
    'src/lib/tracking.ts', 'src/lib/store.ts', 'src/lib/github-client.ts', 'src/lib/tracking-service.ts', 'src/lib/api.ts', 'src/lib/request-log.ts',
    '--outDir', output, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--esModuleInterop', '--strict', '--skipLibCheck'], { stdio: 'inherit' });
  if (compilation.status !== 0) process.exitCode = compilation.status || 1;
  else {
    const files = (await readdir('tests')).filter((file) => file.endsWith('.test.cjs')).map((file) => `tests/${file}`);
    const result = spawnSync(process.execPath, ['--test', ...files], {
      stdio: 'inherit', env: { ...process.env, TEST_BUILD_DIR: output },
    });
    process.exitCode = result.status || 0;
  }
} finally { await rm(output, { recursive: true, force: true }); }
