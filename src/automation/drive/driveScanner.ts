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

  if (creds.type && creds.type !== 'service_account') {
    throw new Error(
      `Arquivo incorreto: tipo "${creds.type}". É necessário uma Service Account (type: "service_account"), não OAuth2 Client. Crie uma Service Account no Google Cloud Console e baixe o JSON dela.`
    )
  }

  if (!creds.client_email || !creds.private_key) {
    const keys = Object.keys(creds).join(', ')
    throw new Error(`Credenciais do Google malformadas: faltam client_email ou private_key. Chaves encontradas: [${keys}]`)
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

function isoToFileDateStr(isoDate: string): string {
  // '2026-05-29' → '29.05.26'
  const [y, m, d] = isoDate.split('T')[0]!.split('-')
  return `${d}.${m}.${y!.slice(2)}`
}

export async function findReportLink(params: {
  matricula: string
  motoristaNome: string
  base: string
  folderId?: string
  eventDate?: string
  typeFilter?: string
  fileName?: string
  /** Quando true, ignora o filtro de data no nome do arquivo (fileDateStr).
   *  Use para buscas de medida/tratativa, cujo nome usa data de upload, não data do evento. */
  skipFileDateFilter?: boolean
}): Promise<DriveMatch | null> {
  const drive = getDriveClient()
  const cfg = getConfig()
  const { matricula, motoristaNome, folderId = cfg.google_drive_folder_id, eventDate, typeFilter, fileName, skipFileDateFilter } = params

  const dateFilter = eventDate ? ` and createdTime >= '${eventDate}T00:00:00'` : ''

  if (fileName) {
    // Tenta match exato, depois com .pdf, depois sem .pdf (cobre inconsistências de extensão)
    const namesToTry = [fileName, fileName.endsWith('.pdf') ? fileName.slice(0, -4) : fileName + '.pdf']
    for (const candidate of namesToTry) {
      const escaped = candidate.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const res = await drive.files.list({
        q: `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
        fields: 'files(id, name, webViewLink)',
        pageSize: 1,
      })
      const file = res.data.files?.[0]
      if (file?.webViewLink && file.name) {
        console.log(`[driveScanner] match direto por nome: ${file.name}`)
        return { link: file.webViewLink, fileName: file.name }
      }
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

  // fileDateStr é usado para confirmar a data no nome do arquivo, mas o nome usa data de upload,
  // não data do evento. Desativa quando: (a) já temos fileName direto, ou (b) caller pediu skip.
  const fileDateStr = (eventDate && !fileName && !skipFileDateFilter)
    ? isoToFileDateStr(eventDate.split('T')[0]!)
    : null

  for (const file of files) {
    if (!file.name) continue
    const normFile = normalize(file.name.replace(/\.[^.]+$/, ''))

    if (fileDateStr && !file.name.includes(fileDateStr)) continue

    if (typeFilter && !normFile.includes(normalize(typeFilter))) {
      continue
    }

    console.log(`[driveScanner] match encontrado: ${file.name}`)
    return { link: file.webViewLink ?? '', fileName: file.name }
  }

  return null
}
