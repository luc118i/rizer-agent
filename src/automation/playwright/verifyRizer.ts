import type { Page } from 'playwright'
import { ids } from './selectors'
import { getConfig } from '../../config'
import { logger } from '../../logger'
import { searchOccurrenceInListing } from './occurrenceFilter'

export interface RizerVerifyResult {
  registered: boolean
  rizerId: string | null
  hasTratativa: boolean
  advertencia: boolean
  suspensao: boolean
}

export async function verifyInRizer(page: Page, params: {
  matricula: string
  motoristaNome: string
  tipoOcorrencia: string
  rizerId?: string | null
  dataOcorrencia?: string
}): Promise<RizerVerifyResult> {
  const cfg = getConfig()
  const baseUrl = new URL(cfg.rizer_login_url).origin
  const { matricula, tipoOcorrencia, rizerId: knownId, dataOcorrencia } = params

  if (knownId) {
    logger.info(`[verifyRizer] Usando rizer_id salvo: ${knownId}`)
    return checkEditPage(page, baseUrl, knownId)
  }

  const foundId = await searchOccurrenceInListing(page, { matricula, tipoOcorrencia, dataOcorrencia })

  if (!foundId) {
    logger.info(`[verifyRizer] Não encontrado no RIZER para matrícula "${matricula}"`)
    return { registered: false, rizerId: null, hasTratativa: false, advertencia: false, suspensao: false }
  }

  return checkEditPage(page, baseUrl, foundId)
}

async function checkEditPage(page: Page, baseUrl: string, rizerId: string): Promise<RizerVerifyResult> {
  await page.goto(`${baseUrl}/ocorrencias_disciplinares/${rizerId}/edit`)
  await page.waitForLoadState('networkidle')

  const linkMedidaValue = await page.locator(`#${ids.linkMedida}`).inputValue().catch(() => '')
  const hasTratativa = linkMedidaValue.trim().length > 0

  const advertencia = await page.locator(`#${ids.advertencia}`).isChecked().catch(() => false)
  const suspensao   = await page.locator(`#${ids.suspensao}`).isChecked().catch(() => false)

  logger.info(
    `[verifyRizer] ID ${rizerId} — link_medida: ${hasTratativa ? 'preenchido' : '(vazio)'}` +
    ` | advertência: ${advertencia} | suspensão: ${suspensao}`,
  )
  return { registered: true, rizerId, hasTratativa, advertencia, suspensao }
}
