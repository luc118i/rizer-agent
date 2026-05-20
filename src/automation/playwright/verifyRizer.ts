import type { Page } from 'playwright'
import { ids } from './selectors'
import { getConfig } from '../../config'
import { logger } from '../../logger'

export interface RizerVerifyResult {
  registered: boolean
  rizerId: string | null
  hasTratativa: boolean
}

export async function verifyInRizer(page: Page, params: {
  matricula: string
  motoristaNome: string
  tipoOcorrencia: string
  rizerId?: string | null
}): Promise<RizerVerifyResult> {
  const cfg = getConfig()
  const baseUrl = new URL(cfg.rizer_login_url).origin
  const { matricula, motoristaNome, tipoOcorrencia, rizerId: knownId } = params

  // Se já temos o ID salvo, ir direto para o edit
  if (knownId) {
    logger.info(`[verifyRizer] Usando rizer_id salvo: ${knownId}`)
    return await checkEditPage(page, baseUrl, knownId)
  }

  // Caso contrário, buscar na tabela do RIZER
  const searchTerms = [matricula, motoristaNome.split(' ')[0]!].filter(Boolean)

  for (const term of searchTerms) {
    logger.info(`[verifyRizer] Buscando por "${term}"...`)
    await page.goto(`${baseUrl}/ocorrencias_disciplinares`)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"][aria-controls="datatable-no-buttons"]')
    await searchInput.waitFor({ state: 'visible', timeout: 10000 })
    await searchInput.fill(term)
    await searchInput.press('Enter')
    await page.waitForTimeout(1500)

    const rows = page.locator('#datatable-no-buttons tbody tr')
    const count = await rows.count()

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const text = (await row.innerText()).toUpperCase()

      if (text.includes(tipoOcorrencia.toUpperCase())) {
        const editHref = await row
          .locator('a[href*="/ocorrencias_disciplinares/"][href*="/edit"]')
          .getAttribute('href')

        const match = editHref?.match(/\/ocorrencias_disciplinares\/(\d+)\/edit/)
        if (match?.[1]) {
          const foundId = match[1]
          logger.info(`[verifyRizer] Encontrado ID ${foundId} via "${term}"`)
          return await checkEditPage(page, baseUrl, foundId)
        }
      }
    }
  }

  logger.info(`[verifyRizer] Não encontrado no RIZER para matrícula "${matricula}"`)
  return { registered: false, rizerId: null, hasTratativa: false }
}

async function checkEditPage(page: Page, baseUrl: string, rizerId: string): Promise<RizerVerifyResult> {
  await page.goto(`${baseUrl}/ocorrencias_disciplinares/${rizerId}/edit`)
  await page.waitForLoadState('networkidle')

  const linkMedidaValue = await page.locator(`#${ids.linkMedida}`).inputValue().catch(() => '')
  const hasTratativa = linkMedidaValue.trim().length > 0

  logger.info(`[verifyRizer] ID ${rizerId} — link_medida: ${hasTratativa ? '"' + linkMedidaValue.slice(0, 60) + '..."' : '(vazio)'}`)
  return { registered: true, rizerId, hasTratativa }
}
