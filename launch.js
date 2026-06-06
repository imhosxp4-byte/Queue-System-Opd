#!/usr/bin/env node
const { spawn, exec } = require('child_process')
const path = require('path')

const PORT = process.env.PORT || 3200
const URL = `http://localhost:${PORT}`

const server = spawn(process.execPath, [path.join(__dirname, 'server', 'index.js')], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env },
})

server.on('error', (err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})

server.on('close', (code) => process.exit(code || 0))

// Wait briefly then open browser
setTimeout(() => {
  const cmd = process.platform === 'win32'
    ? `start "" "${URL}"`
    : process.platform === 'darwin'
      ? `open "${URL}"`
      : `xdg-open "${URL}"`
  exec(cmd)
}, 1500)
