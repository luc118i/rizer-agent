import type { Page } from 'playwright'
import { ids } from './selectors'
import type { OccurrenceData } from '../types/automation.types'
import { takeErrorScreenshot } from './helpers'
import { registerMotorista } from './motorista'
import { getConfig } from '../../config'

class MotoristaNotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'MotoristaNotFoundError' }
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0]!.split('-')
  return `${d}/${m}/${y}`
}

async function selectBsOption(page: Page, id: string, value: string): Promise<void> {
  const sel = `#${id}`
  try {
    await page.selectOption(sel, { label: value }, { force: true, timeout: 5000 })
    await refreshPicker(page, sel)
    return
  } catch { /* tenta parcial */ }

  const ok = await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel) as HTMLSelectElement | null
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
  }, { sel, val: value })

  if (!ok) throw new Error(`Opção "${value}" não encontrada em #${id}`)
}

async function refreshPicker(page: Page, sel: string): Promise<void> {
  await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (el && (window as any).$) (window as any).$(el).selectpicker('refresh')
  }, sel)
}

async function selectBsLiveSearch(page: Page, id: string, searchText: string): Promise<void> {
  const sel = `#${id}`
  const hasOptions = await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLSelectElement | null
    return el ? el.options.length > 1 : false
  }, sel)

  if (hasOptions) {
    try {
      await selectBsOption(page, id, searchText)
      return
    } catch { /* cai no live search */ }
  }

  const triggerBtn = page.locator(`button.dropdown-toggle[data-id="${id}"]`)
  await triggerBtn.waitFor({ state: 'visible', timeout: 10000 })
  await triggerBtn.click()

  const searchInput = page.locator(`.bootstrap-select.open .bs-searchbox input, .bootstrap-select.show .bs-searchbox input`).first()
  await searchInput.waitFor({ state: 'visible', timeout: 5000 })
  await searchInput.fill(searchText)

  await page.waitForTimeout(1500)

  const noResults = await page.locator(
    `.bootstrap-select.open .dropdown-menu li.no-results, ` +
    `.bootstrap-select.show .dropdown-menu li.no-results`
  ).count()

  if (noResults > 0) {
    await page.keyboard.press('Escape')
    throw new MotoristaNotFoundError(`Motorista "${searchText}" não encontrado no RIZER`)
  }

  const firstOption = page.locator(
    `.bootstrap-select.open .dropdown-menu li:not(.hidden):not(.no-results) a, ` +
    `.bootstrap-select.show .dropdown-menu li:not(.hidden):not(.no-results) a`
  ).first()
  await firstOption.waitFor({ state: 'visible', timeout: 6000 })
  await firstOption.click()
}

async function fillTextInput(page: Page, id: string, value: string): Promise<void> {
  const sel = `#${id}`
  await page.locator(sel).waitFor({ state: 'visible', timeout: 10000 })
  await page.click(sel)
  await page.fill(sel, value)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

export async function createDisciplinary(page: Page, data: OccurrenceData): Promise<string | null> {
  const cfg = getConfig()
  await page.goto(cfg.rizer_disciplinary_url)
  await page.waitForLoadState('networkidle')

  const pause = () => page.waitForTimeout(600)

  try {
    try {
      await selectBsLiveSearch(page, ids.motorista, data.motorista_nome)
    } catch (err) {
      if (!(err instanceof MotoristaNotFoundError)) throw err
      await registerMotorista(page, data)
      await page.goto(cfg.rizer_disciplinary_url)
      await page.waitForLoadState('networkidle')
      await selectBsLiveSearch(page, ids.motorista, data.motorista_nome)
    }
    await pause()

    const prefixoTag = await page.evaluate((id) => {
      const el = document.getElementById(id)
      return el?.tagName.toLowerCase() ?? ''
    }, ids.prefixo)

    if (prefixoTag === 'select') {
      await selectBsLiveSearch(page, ids.prefixo, data.prefixo)
    } else {
      await fillTextInput(page, ids.prefixo, data.prefixo)
    }
    await pause()

    const dataOcorrencia = data.data_ocorrencia.includes('-')
      ? formatDate(data.data_ocorrencia)
      : data.data_ocorrencia
    await fillTextInput(page, ids.dataOcorrencia, dataOcorrencia)
    await pause()

    await selectBsLiveSearch(page, ids.responsavel, data.responsavel)
    await pause()

    await selectBsOption(page, ids.tipoOcorrencia, data.tipo_ocorrencia)
    await pause()

    await selectBsOption(page, ids.operacao, 'CATEDRAL')
    await pause()

    if (data.advertencia) {
      const advBox = page.locator(`#${ids.advertencia}`)
      if (!await advBox.isChecked()) await advBox.check({ force: true })
    } else {
      const suspBox = page.locator(`#${ids.suspensao}`)
      if (!await suspBox.isChecked()) await suspBox.check({ force: true })
    }
    await pause()

    await selectBsOption(page, ids.visibilidade, 'Disponivel para todos')
    await pause()

    if (data.link_relatorio) {
      await fillTextInput(page, ids.linkRelatorio, data.link_relatorio)
      await pause()
    }

    if (data.advertencia && data.link_medida) {
      const exists = await page.locator(`#${ids.linkMedida}`).count()
      if (exists > 0) {
        await fillTextInput(page, ids.linkMedida, data.link_medida)
        await pause()
      }
    }

    const saveBtn = page.locator('button.form-group-btn-add-cadastrar, button[type="submit"]:has-text("Cadastrar")')
    await saveBtn.waitFor({ state: 'visible', timeout: 10000 })
    await saveBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 20000 })

    const urlMatch = page.url().match(/\/ocorrencias_disciplinares\/(\d+)/)
    const rizerId = urlMatch?.[1] ?? null
    console.log(`[disciplinary] ID capturado no RIZER: ${rizerId}`)
    return rizerId
  } catch (err) {
    await takeErrorScreenshot(page, 'disciplinary')
    throw err
  }
}
