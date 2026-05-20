import type { Page, BrowserContext } from 'playwright'
import { saveSession } from './browser'
import { takeErrorScreenshot } from './helpers'
import { getConfig } from '../../config'

function loginBase(loginUrl: string): string {
  return loginUrl.replace(/\/$/, '')
}

export async function login(page: Page, context: BrowserContext): Promise<void> {
  const cfg = getConfig()
  const LOGIN_URL = cfg.rizer_login_url

  await page.goto(LOGIN_URL)
  await page.waitForLoadState('domcontentloaded')

  const userInput = page.locator('input[placeholder="Digite seu usuário"]')
  await userInput.waitFor({ state: 'visible' })
  await userInput.click()
  await userInput.pressSequentially(cfg.rizer_email, { delay: 50 })

  const passInput = page.locator('input[type="password"]')
  await passInput.click()
  await passInput.pressSequentially(cfg.rizer_password, { delay: 50 })

  await page.click('button[type="submit"]')

  const base = loginBase(LOGIN_URL)
  try {
    await page.waitForURL(
      url => {
        const u = url.toString()
        return u !== base && u !== base + '/'
      },
      { timeout: 45000 }
    )
  } catch {
    await takeErrorScreenshot(page, 'login')
    throw new Error(`Login no RIZER falhou — credenciais inválidas ou timeout. URL atual: ${page.url()}`)
  }

  await page.waitForLoadState('networkidle')
  await saveSession(context)
}

export function isOnLoginPage(page: Page): boolean {
  const cfg = getConfig()
  const url = page.url()
  const base = loginBase(cfg.rizer_login_url)
  return url === base || url === base + '/' || url.includes('/login') || url.includes('/auth')
}
