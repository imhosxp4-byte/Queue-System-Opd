#!/usr/bin/env node
// Launcher script that clears ELECTRON_RUN_AS_NODE before starting Electron
const { spawn } = require('child_process')
const path = require('path')

const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe')

const env = { ...process.env }
delete env['ELECTRON_RUN_AS_NODE']
delete env['ELECTRON_RUN_AS_NODE'.toLowerCase()]

const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env,
  cwd: __dirname
})

child.on('close', (code) => process.exit(code || 0))
child.on('error', (err) => {
  console.error('Failed to start Electron:', err.message)
  process.exit(1)
})
