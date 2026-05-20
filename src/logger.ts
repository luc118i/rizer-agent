import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let logPath: string | null = null

function getLogPath(): string {
  if (!logPath) {
    const logsDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    logPath = path.join(logsDir, 'automation.log')
  }
  return logPath
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', ...args: any[]): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`
  console.log(line)
  try {
    fs.appendFileSync(getLogPath(), line + '\n', 'utf-8')
  } catch { /* não bloqueia se falhar */ }
}

export function getLogsDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

export const logger = {
  info:  (...a: any[]) => log('INFO',  ...a),
  warn:  (...a: any[]) => log('WARN',  ...a),
  error: (...a: any[]) => log('ERROR', ...a),
}
