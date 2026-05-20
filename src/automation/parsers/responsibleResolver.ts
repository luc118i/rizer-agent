import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import Fuse from 'fuse.js'
import type { ResolvedResponsible } from '../types/automation.types'

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

interface CSVRow {
  base: string
  responsavel: string
  visibilidade: string
}

interface CSVRowNorm extends CSVRow {
  baseNorm: string
}

function getCsvPath(): string {
  return process.env['CSV_PATH'] ?? path.resolve(__dirname, '../../automation/csv/responsaveis.csv')
}

async function loadCSV(): Promise<CSVRowNorm[]> {
  return new Promise((resolve, reject) => {
    const rows: CSVRowNorm[] = []
    fs.createReadStream(getCsvPath())
      .pipe(csv())
      .on('data', (row: CSVRow) => rows.push({ ...row, baseNorm: normalize(row.base) }))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

export async function resolveResponsible(base_operacional: string): Promise<ResolvedResponsible> {
  const rows = await loadCSV()
  const needle = normalize(base_operacional)

  const exact = rows.find(r => r.baseNorm === needle)
  if (exact) return { responsavel: exact.responsavel, visibilidade: exact.visibilidade }

  const fuse = new Fuse(rows, { keys: ['baseNorm'], threshold: 0.35 })
  const result = fuse.search(needle)

  if (result.length === 0) {
    throw new Error(`Base operacional não encontrada: "${base_operacional}"`)
  }

  const match = result[0]!.item
  console.warn(`[resolver] Fuzzy match: "${base_operacional}" → "${match.base}"`)
  return { responsavel: match.responsavel, visibilidade: match.visibilidade }
}
