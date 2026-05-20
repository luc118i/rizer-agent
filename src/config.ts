import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export interface AgentConfig {
  supabase_url: string
  supabase_service_role_key: string
  rizer_login_url: string
  rizer_email: string
  rizer_password: string
  google_service_account_json_b64: string
  google_drive_folder_id: string
  google_drive_medidas_folder_id: string
  headless?: boolean
}

export function getRizerDisciplinaryUrl(cfg: AgentConfig): string {
  const origin = new URL(cfg.rizer_login_url).origin
  return `${origin}/ocorrencias_disciplinares/create`
}

let cachedConfig: AgentConfig | null = null

export function clearCachedConfig(): void {
  cachedConfig = null
}

export function getConfig(): AgentConfig {
  if (cachedConfig) return cachedConfig

  const configPath = path.join(app.getPath('userData'), 'config.json')

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Arquivo de configuração não encontrado em:\n${configPath}\n\n` +
      `Copie o config.example.json para esse caminho e preencha as credenciais.`
    )
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    cachedConfig = JSON.parse(raw) as AgentConfig
    return cachedConfig
  } catch (err: any) {
    throw new Error(`Erro ao ler config.json: ${err.message}`)
  }
}

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}
