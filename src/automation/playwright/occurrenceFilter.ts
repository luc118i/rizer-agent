import type { Page } from 'playwright'
import { getConfig } from '../../config'
import { logger } from '../../logger'

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('T')[0]!.split('-')
  return `${d}/${m}/${y}`
}

async function fillMatriculaFilter(page: Page, matricula: string): Promise<void> {
  const label = page.locator('label').filter({ hasText: /^Matricula\s*\*?$/i }).first()
  const forAttr = await label.getAttribute('for').catch(() => null)

  const input = forAttr
    ? page.locator(`#${forAttr}`)
    : page.locator('input[name*="matricula"]').first()

  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(matricula)
}

async function selectTipoOcorrenciaFilter(page: Page, tipoOcorrencia: string): Promise<void> {
  // Busca a label "Tipo de Ocorrência *" e obtém o id do select associado.
  // Primeiro tenta label[for]; se ausente (bootstrap-select pode remover),
  // navega para o select mais próximo dentro do mesmo .form-group.
  const label = page.locator('label').filter({ hasText: /Tipo de Ocorrência/i }).first()

  const selectId = await label.evaluate((el: Element) => {
    // 1) via atributo for
    const forVal = (el as HTMLLabelElement).htmlFor
    if (forVal) return forVal

    // 2) select dentro do mesmo grupo
    const group = el.closest('.form-group, .col-md-3, .col-sm-3, .col-lg-3, div')
    const sel = group?.querySelector('select')
    return sel?.id ?? null
  }).catch(() => null)

  if (!selectId) {
    logger.warn('[occurrenceFilter] Não foi possível localizar o select de "Tipo de Ocorrência"')
    return
  }

  const ok = await page.evaluate(({ id, val }: { id: string; val: string }) => {
    const el = document.getElementById(id) as HTMLSelectElement | null
    if (!el) return false
    const needle = val.toLowerCase()
    for (const opt of Array.from(el.options)) {
      if (opt.text.toLowerCase().includes(needle)) {
        el.value = opt.value
        el.dispatchEvent(new Event('change', { bubbles: true }))
        if ((window as any).$) (window as any).$(el).selectpicker('refresh')
        return true
      }
    }
    return false
  }, { id: selectId, val: tipoOcorrencia })

  if (!ok) logger.warn(`[occurrenceFilter] Tipo "${tipoOcorrencia}" não encontrado no dropdown de filtro`)
}

/**
 * Usa o formulário de filtro da listagem (/ocorrencias_disciplinares)
 * preenchendo Matricula + "Tipo de Ocorrência *" e clicando em Pesquisar.
 * Retorna o ID da primeira ocorrência encontrada, ou null se não encontrar.
 */
export async function searchOccurrenceInListing(
  page: Page,
  params: { matricula: string; tipoOcorrencia: string; dataOcorrencia?: string },
): Promise<string | null> {
  const { matricula, tipoOcorrencia, dataOcorrencia } = params
  const cfg = getConfig()
  const baseUrl = new URL(cfg.rizer_login_url).origin

  await page.goto(`${baseUrl}/ocorrencias_disciplinares`)
  await page.waitForLoadState('networkidle')

  await fillMatriculaFilter(page, matricula)
  await selectTipoOcorrenciaFilter(page, tipoOcorrencia)

  await page.locator('button:has-text("Pesquisar")').click()
  await page.waitForLoadState('networkidle')

  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  logger.info(`[occurrenceFilter] ${count} resultado(s) — matrícula "${matricula}" + tipo "${tipoOcorrencia}"`)

  // Descobre o índice da coluna de data dinamicamente
  const headers = page.locator('table thead th')
  const headerCount = await headers.count()
  let dateColIndex = -1
  for (let i = 0; i < headerCount; i++) {
    const text = (await headers.nth(i).textContent() ?? '').toLowerCase()
    if (text.includes('data')) { dateColIndex = i; break }
  }

  const expectedDate = dataOcorrencia ? isoToDisplay(dataOcorrencia) : null

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)

    if (expectedDate && dateColIndex >= 0) {
      const dateText = (await row.locator('td').nth(dateColIndex).textContent().catch(() => '') ?? '').trim()
      if (!dateText.startsWith(expectedDate)) {
        logger.info(`[occurrenceFilter] Linha ${i}: data "${dateText}" ≠ "${expectedDate}" — ignorando`)
        continue
      }
    }

    const editHref = await row
      .locator('a[href*="/ocorrencias_disciplinares/"][href*="/edit"]')
      .getAttribute('href')
      .catch(() => null)

    const match = editHref?.match(/\/ocorrencias_disciplinares\/(\d+)\/edit/)
    if (match?.[1]) {
      logger.info(`[occurrenceFilter] ID encontrado: ${match[1]}`)
      return match[1]
    }
  }

  logger.info('[occurrenceFilter] Nenhuma ocorrência encontrada com os filtros aplicados')
  return null
}
