import type { Page, BrowserContext } from 'playwright'
import { saveSession } from './browser'
import { takeErrorScreenshot } from './helpers'
import { getConfig } from '../../config'
import { logger } from '../../logger'

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
  logger.info(`[login] Formulário enviado — aguardando sumir o formulário de login...`)

  const loginInput = page.locator('input[placeholder="Digite seu usuário"]')
  try {
    await loginInput.waitFor({ state: 'hidden', timeout: 90000 })
  } catch {
    const currentUrl = page.isClosed() ? '(página fechada)' : page.url()
    logger.error(`[login] Timeout — formulário ainda visível. URL atual: ${currentUrl}`)
    await takeErrorScreenshot(page, 'login')
    throw new Error(`Login no RIZER falhou — credenciais inválidas ou timeout. URL atual: ${currentUrl}`)
  }

  logger.info(`[login] Login bem-sucedido → ${page.url()}`)
  await page.waitForLoadState('networkidle')
  await saveSession(context)
  logger.info(`[login] Sessão salva com sucesso`)
}

export async function isOnLoginPage(page: Page): Promise<boolean> {
  try {
    return await page.locator('input[placeholder="Digite seu usuário"]').isVisible({ timeout: 3000 })
  } catch {
    return false
  }
}
