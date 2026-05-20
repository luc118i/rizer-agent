import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'

function getScreenshotsDir(): string {
  return process.env['SCREENSHOTS_DIR'] ?? path.resolve(process.cwd(), 'screenshots')
}

export async function takeErrorScreenshot(page: Page, label: string): Promise<string> {
  const dir = getScreenshotsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `error_${label}_${timestamp}.png`
  const filepath = path.join(dir, filename)

  await page.screenshot({ path: filepath, fullPage: true })
  console.error(`[helpers] Screenshot salvo: ${filepath}`)
  return filepath
}
