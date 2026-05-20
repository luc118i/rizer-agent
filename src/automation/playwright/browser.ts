import { chromium } from 'playwright'
import type { BrowserContext } from 'playwright'
import path from 'path'
import fs from 'fs'
import { getConfig } from '../../config'

function getAuthFile(): string {
  return process.env['AUTH_FILE'] ?? path.resolve(process.cwd(), 'auth.json')
}

export async function createBrowser() {
  const cfg = getConfig()
  return chromium.launch({ headless: cfg.headless ?? false })
}

export async function createContextWithSession() {
  const browser = await createBrowser()
  const authFile = getAuthFile()
  const hasSession = fs.existsSync(authFile)

  const context = await browser.newContext(
    hasSession ? { storageState: authFile } : {}
  )

  return { browser, context }
}

export async function saveSession(context: BrowserContext) {
  const authFile = getAuthFile()
  await context.storageState({ path: authFile })
}
