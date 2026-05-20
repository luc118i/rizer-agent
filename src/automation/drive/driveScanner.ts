import { google } from 'googleapis'
import type { AIExtractedData } from '../types/automation.types'
import { getConfig } from '../../config'

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

function getDriveClient() {
  const cfg = getConfig()

  if (!cfg.google_service_account_json_b64) {
    throw new Error('Service Account do Google não configurada. Abra as Configurações do agente e selecione o arquivo JSON.')
  }

  let creds: any
  try {
    const json = Buffer.from(cfg.google_service_account_json_b64, 'base64').toString('utf-8')
    creds = JSON.parse(json)
  } catch {
    throw new Error('Service Account do Google inválida. Abra as Configurações do agente e selecione novamente o arquivo JSON.')
  }

  if (!creds.client_email || !creds.private_key) {
    throw new Error('Credenciais do Google malformadas: faltam client_email ou private_key')
  }

  const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES })
  return google.drive({ version: 'v3', auth })
}

export interface DriveMatch {
  link: string
  fileName: string
}

export interface DriveReport {
  fileId: string
  fileName: string
  webViewLink: string
  parsed: AIExtractedData & { tipo_ocorrencia: string }
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export async function findReportLink(params: {
  matricula: string
  motoristaNome: string
  base: string
  folderId?: string
  eventDate?: string
  typeFilter?: string
  fileName?: string
}): Promise<DriveMatch | null> {
  const drive = getDriveClient()
  const cfg = getConfig()
  const { matricula, motoristaNome, folderId = cfg.google_drive_folder_id, eventDate, typeFilter, fileName } = params

  const dateFilter = eventDate ? ` and createdTime >= '${eventDate}T00:00:00'` : ''

  if (fileName) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
    })
    const file = res.data.files?.[0]
    if (file?.webViewLink && file.name) {
      console.log(`[driveScanner] match direto por nome: ${file.name}`)
      return { link: file.webViewLink, fileName: file.name }
    }
  }

  const searchTerm = matricula || normalize(motoristaNome).split(' ')[0]

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains '${searchTerm}' and trashed = false${dateFilter}`,
    fields: 'files(id, name, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: 50,
  })

  const files = res.data.files ?? []
  console.log(`[driveScanner] ${files.length} arquivo(s) para "${searchTerm}" na pasta ${folderId}`)

  for (const file of files) {
    if (!file.name) continue
    const normFile = normalize(file.name.replace(/\.[^.]+$/, ''))

    if (typeFilter && !normFile.includes(normalize(typeFilter))) {
      continue
    }

    console.log(`[driveScanner] match encontrado: ${file.name}`)
    return { link: file.webViewLink ?? '', fileName: file.name }
  }

  return null
}
