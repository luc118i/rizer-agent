import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import type { ResolvedResponsible } from '../types/automation.types'
import { logger } from '../../logger'

interface CSVRow {
  base: string
  responsavel: string
  visibilidade: string
}

function getCsvPath(): string {
  return process.env['CSV_PATH'] ?? path.resolve(__dirname, '../../automation/csv/responsaveis.csv')
}

async function loadCSV(): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CSVRow[] = []
    fs.createReadStream(getCsvPath())
      .pipe(csv())
      .on('data', (row: CSVRow) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export async function resolveResponsible(base_operacional: string): Promise<ResolvedResponsible> {
  const rows = await loadCSV()
  const needle = normalize(base_operacional)

  // 1. Exact match (sigla ou nome normalizado)
  const exact = rows.find(r => normalize(r.base) === needle)
  if (exact) {
    logger.info(`[resolver] Match exato: "${base_operacional}" → ${exact.responsavel}`)
    return { responsavel: exact.responsavel, visibilidade: exact.visibilidade }
  }

  // 2. Partial: a sigla passada é prefixo de alguma base do CSV
  const partial = rows.find(r => normalize(r.base).startsWith(needle) || needle.startsWith(normalize(r.base)))
  if (partial) {
    logger.warn(`[resolver] Match parcial: "${base_operacional}" → "${partial.base}" → ${partial.responsavel}`)
    return { responsavel: partial.responsavel, visibilidade: partial.visibilidade }
  }

  throw new Error(
    `Base operacional não encontrada no CSV: "${base_operacional}". ` +
    `Bases disponíveis: ${rows.map(r => r.base).join(', ')}`
  )
}
