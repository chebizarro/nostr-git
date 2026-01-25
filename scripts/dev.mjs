#!/usr/bin/env node
/**
 * Development watch script for @nostr-git/core
 *
 * Runs TypeScript compiler and worker bundler in watch mode concurrently.
 *
 * Usage: pnpm dev
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('Starting @nostr-git/core development mode...\n');

// Start TypeScript watch
const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.base.json', '--watch', '--preserveWatchOutput'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

// Start worker bundler watch
const worker = spawn('node', ['scripts/bundle-worker.mjs', '--watch'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

// Prefix output with source indicator
const prefixOutput = (stream, prefix, color) => {
  stream.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      console.log(`${color}[${prefix}]${'\x1b[0m'} ${line}`);
    }
  });
};

// TypeScript output in cyan
prefixOutput(tsc.stdout, 'tsc', '\x1b[36m');
prefixOutput(tsc.stderr, 'tsc', '\x1b[36m');

// Worker bundler output in yellow
prefixOutput(worker.stdout, 'worker', '\x1b[33m');
prefixOutput(worker.stderr, 'worker', '\x1b[33m');

// Handle process exit
const cleanup = () => {
  console.log('\nShutting down...');
  tsc.kill();
  worker.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Handle child process errors
tsc.on('error', (err) => {
  console.error('\x1b[31m[tsc]\x1b[0m Error:', err.message);
});

worker.on('error', (err) => {
  console.error('\x1b[31m[worker]\x1b[0m Error:', err.message);
});

// Handle child process exit
tsc.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`\x1b[31m[tsc]\x1b[0m Exited with code ${code}`);
  }
});

worker.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`\x1b[31m[worker]\x1b[0m Exited with code ${code}`);
  }
});

console.log('\x1b[32m✓\x1b[0m Watch mode started. Press Ctrl+C to stop.\n');
