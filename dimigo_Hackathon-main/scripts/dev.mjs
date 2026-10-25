import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const children = [spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server/index.mjs', '--demo'], { cwd: root, stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { cwd: root, stdio: 'inherit' })]
let stopping = false
const stop = code => { if (stopping) return; stopping = true; children.forEach(c => c.kill()); process.exitCode = code || 0 }
children.forEach(child => { child.on('error', () => stop(1)); child.on('exit', code => stop(code)) })
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0))
