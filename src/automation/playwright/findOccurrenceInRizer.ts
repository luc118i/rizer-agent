import type { Page } from 'playwright'
import { getConfig } from '../../config'

export async function findRizerOccurrenceId(page: Page, params: {
  matricula: string
  tipoOcorrencia: string
  motoristaNome?: string
  eventDate?: string
}): Promise<string> {
  const { matricula, tipoOcorrencia, motoristaNome } = params
  const cfg = getConfig()
  const baseUrl = new URL(cfg.rizer_disciplinary_url).origin

  const searchTerms: string[] = []
  if (matricula) searchTerms.push(matricula)
  if (motoristaNome) searchTerms.push(motoristaNome.split(' ')[0]!)

  for (const term of searchTerms) {
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
          console.log(`[findRizer] Encontrado via termo "${term}": ID ${match[1]}`)
          return match[1]
        }
      }
    }

    console.log(`[findRizer] Nenhum resultado para "${term}", tentando próximo termo...`)
  }

  throw new Error(
    `Ocorrência não encontrada no RIZER: matrícula "${matricula}", tipo "${tipoOcorrencia}"`
  )
}
