const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.cwd();
const ekascribeRoot = path.resolve(projectRoot, '..', 'web');
const repoRoot = path.resolve(projectRoot, '..', '..');
const nextRoot = path.join(ekascribeRoot, '.next');
const standaloneRoot = path.join(nextRoot, 'standalone');
const runtimeRoot = path.join(projectRoot, 'runtime');
const staticRoot = path.join(nextRoot, 'static');
const publicRoot = path.join(ekascribeRoot, 'public');
const webNodeModules = fs.existsSync(path.join(ekascribeRoot, 'node_modules', 'next'))
  ? path.join(ekascribeRoot, 'node_modules')
  : path.join(repoRoot, 'node_modules');
const sourceNextCompiledRoot = path.join(webNodeModules, 'next', 'dist', 'compiled');
const runtimeNextCompiledRoot = path.join(
  runtimeRoot,
  'node_modules',
  'next',
  'dist',
  'compiled'
);
const runtimeNodeModulesRoot = path.join(runtimeRoot, 'node_modules');
const runtimeBuildTimePackages = [
  'typescript',
  'webpack',
  'terser',
  'terser-webpack-plugin',
  'esbuild',
  '@esbuild',
  '@webassemblyjs',
  'enhanced-resolve',
  'loader-runner',
  'watchpack',
  'jest-worker',
  'schema-utils',
  'neo-async',
  'caniuse-lite',
  'browserslist',
];
const runtimePruneDirectories = new Set([
  '__tests__',
  '__mocks__',
  'test',
  'tests',
  'docs',
  'doc',
  'examples',
  '.github',
  '.vscode',
  'coverage',
  'benchmark',
  'benchmarks',
]);
const runtimePruneFilePatterns = [
  /\.map$/i,
  /\.md$/i,
  /\.markdown$/i,
  /\.ts$/i,
  /\.tsx$/i,
];

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`[prepare-ekascribe-runtime] Missing ${label}: ${targetPath}`);
  }
}

function copyDir(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}

function copyMissingEntries(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir) || !fs.existsSync(destinationDir)) {
    return;
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourceEntryPath = path.join(sourceDir, entry.name);
    const destinationEntryPath = path.join(destinationDir, entry.name);
    if (fs.existsSync(destinationEntryPath)) {
      continue;
    }
    fs.cpSync(sourceEntryPath, destinationEntryPath, { recursive: true });
  }
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}

function pruneRuntimeNodeModules() {
  if (!fs.existsSync(runtimeNodeModulesRoot)) {
    return;
  }
  for (const packageName of runtimeBuildTimePackages) {
    removePathIfExists(path.join(runtimeNodeModulesRoot, packageName));
  }
  pruneRuntimeByPatterns(runtimeNodeModulesRoot);
}

function shouldPruneFile(fileName) {
  return runtimePruneFilePatterns.some((pattern) => pattern.test(fileName));
}

function pruneRuntimeByPatterns(rootDir) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (runtimePruneDirectories.has(entry.name.toLowerCase())) {
          fs.rmSync(entryPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
          continue;
        }
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && shouldPruneFile(entry.name)) {
        fs.rmSync(entryPath, { force: true, maxRetries: 10, retryDelay: 500 });
      }
    }
  }
}

ensureExists(standaloneRoot, 'Next standalone output');

fs.rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
// In a monorepo, Next nests standalone output under the workspace path
// (standalone/apps/web) with the shared node_modules at the standalone root.
// Flatten so runtime/ is a directly runnable app dir.
const monorepoAppRoot = path.join(standaloneRoot, 'apps', 'web');
if (fs.existsSync(monorepoAppRoot)) {
  copyDir(monorepoAppRoot, runtimeRoot);
  copyDir(path.join(standaloneRoot, 'node_modules'), path.join(runtimeRoot, 'node_modules'));
  const rootPkg = path.join(standaloneRoot, 'package.json');
  if (fs.existsSync(rootPkg) && !fs.existsSync(path.join(runtimeRoot, 'package.json'))) {
    fs.copyFileSync(rootPkg, path.join(runtimeRoot, 'package.json'));
  }
} else {
  copyDir(standaloneRoot, runtimeRoot);
}

if (fs.existsSync(staticRoot)) {
  copyDir(staticRoot, path.join(runtimeRoot, '.next', 'static'));
}

if (fs.existsSync(publicRoot)) {
  copyDir(publicRoot, path.join(runtimeRoot, 'public'));
}

copyMissingEntries(sourceNextCompiledRoot, runtimeNextCompiledRoot);
pruneRuntimeNodeModules();

console.log('[prepare-ekascribe-runtime] Runtime bundle prepared at:', runtimeRoot);
