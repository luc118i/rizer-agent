import { app, Tray, Menu, nativeImage, dialog, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { spawnSync } from 'child_process'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { startServer } from './server'
import type { AgentConfig } from './config'
import { clearCachedConfig } from './config'

let tray: Tray | null = null
let configWin: BrowserWindow | null = null
let serverStarted = false
let updateReady = false

// Impede múltiplas instâncias
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function setupPaths(): void {
  const userData = app.getPath('userData')
  process.env['AUTH_FILE']                 = path.join(userData, 'auth.json')
  process.env['SCREENSHOTS_DIR']           = path.join(userData, 'screenshots')
  process.env['PLAYWRIGHT_BROWSERS_PATH']  = path.join(userData, 'browsers')
  process.env['CSV_PATH'] = app.isPackaged
    ? path.join(process.resourcesPath, 'csv', 'responsaveis.csv')
    : path.join(app.getAppPath(), 'src', 'automation', 'csv', 'responsaveis.csv')
}

function buildTrayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(app.getAppPath(), 'build', 'tray.png')
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath)
  return nativeImage.createEmpty()
}

function buildContextMenu(status: string): Electron.Menu {
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: 'RIZER Agent', enabled: false },
    { label: status, enabled: false },
    { type: 'separator' },
  ]

  if (updateReady) {
    items.push({ label: '⬆ Instalar atualização e reiniciar', click: () => autoUpdater.quitAndInstall() })
    items.push({ type: 'separator' })
  }

  items.push(
    { label: 'Configurações', click: () => openConfigWindow() },
    { label: 'Abrir pasta de dados', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  )

  return Menu.buildFromTemplate(items)
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Nova versão disponível: ${info.version}`)
    tray?.setToolTip(`RIZER Agent — baixando v${info.version}...`)
  })

  autoUpdater.on('update-downloaded', () => {
    updateReady = true
    tray?.setToolTip('RIZER Agent — atualização pronta!')
    tray?.setContextMenu(buildContextMenu('⬆ Atualização pronta — clique para instalar'))
    dialog.showMessageBox({
      type: 'info',
      title: 'RIZER Agent — Atualização',
      message: 'Uma nova versão foi baixada. Clique em OK para instalar e reiniciar.',
      buttons: ['Instalar agora', 'Depois'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Erro:', err.message)
  })

  // Verifica na inicialização (só em produção)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {})
  }
}

// ── Janela de configuração ────────────────────────────────────────────────────

function openConfigWindow(): void {
  if (configWin && !configWin.isDestroyed()) {
    configWin.focus()
    return
  }

  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'preload.js')
    : path.join(app.getAppPath(), 'dist', 'preload.js')

  const htmlPath = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer', 'config.html')
    : path.join(app.getAppPath(), 'src', 'renderer', 'config.html')

  configWin = new BrowserWindow({
    width: 560,
    height: 680,
    resizable: false,
    title: 'RIZER Agent — Configuração',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  configWin.loadFile(htmlPath)
  configWin.on('closed', () => { configWin = null })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

function registerIPC(): void {
  // Lê config atual (ou null se não existir)
  ipcMain.handle('get-config', () => {
    const p = getConfigPath()
    if (!fs.existsSync(p)) return null
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
  })

  // Salva config e (re)inicia o servidor
  ipcMain.handle('save-config', async (_e, cfg: AgentConfig) => {
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true })
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
    clearCachedConfig()

    if (!serverStarted) {
      try {
        await tryStartServer()
      } catch { /* erro já tratado dentro de tryStartServer */ }
    }
  })

  // Abre seletor de arquivo JSON da service account
  ipcMain.handle('pick-json-file', async () => {
    const result = await dialog.showOpenDialog(configWin!, {
      title: 'Selecionar Service Account JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const raw = fs.readFileSync(filePath, 'utf-8')
    const b64 = Buffer.from(raw).toString('base64')
    return { b64, name: path.basename(filePath) }
  })

  // Testa conexão com Supabase
  ipcMain.handle('test-connection', async (_e, cfg: AgentConfig) => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const client = createClient(cfg.supabase_url, cfg.supabase_service_role_key)
      const { error } = await client.from('occurrences').select('id').limit(1)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Supabase conectado com sucesso!' }
    } catch (err: any) {
      return { ok: false, message: err.message ?? 'Erro desconhecido' }
    }
  })
}

// ── Inicialização do servidor ─────────────────────────────────────────────────

async function ensureChromium(): Promise<void> {
  const browsersPath = process.env['PLAYWRIGHT_BROWSERS_PATH']!
  const chromiumDir = fs.existsSync(browsersPath)
    ? fs.readdirSync(browsersPath).some(d => d.startsWith('chromium'))
    : false

  if (chromiumDir) {
    console.log('[main] Chromium já instalado.')
    return
  }

  console.log('[main] Instalando Chromium (primeira execução)...')
  tray?.setToolTip('RIZER Agent — Instalando Chromium...')

  const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    env: { ...process.env },
    stdio: 'pipe',
    timeout: 180_000,
    shell: true,
    cwd: app.getAppPath(),
  })

  if (result.status !== 0) {
    const detail = result.error?.message
      ?? result.stderr?.toString()
      ?? result.stdout?.toString()
      ?? 'erro desconhecido'
    throw new Error(`Falha ao instalar Chromium:\n${detail}`)
  }

  console.log('[main] Chromium instalado com sucesso.')
}

async function tryStartServer(): Promise<void> {
  await ensureChromium()
  await startServer(3334)
  serverStarted = true
  tray?.setToolTip('RIZER Agent ✓  localhost:3334')
  tray?.setContextMenu(buildContextMenu('✓  Rodando em localhost:3334'))
  console.log('[main] Agente pronto.')
}

// ── App ready ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupPaths()
  app.setLoginItemSettings({ openAtLogin: true })
  registerIPC()
  setupAutoUpdater()

  const icon = buildTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('RIZER Agent — iniciando...')
  tray.setContextMenu(buildContextMenu('Iniciando...'))

  const configExists = fs.existsSync(getConfigPath())

  if (!configExists) {
    // Primeira execução — abre janela de configuração
    tray.setToolTip('RIZER Agent — configure as credenciais')
    tray.setContextMenu(buildContextMenu('⚠ Configure as credenciais'))
    openConfigWindow()
    return
  }

  try {
    await tryStartServer()
  } catch (err: any) {
    const msg: string = err.message ?? String(err)
    console.error('[main] Erro ao iniciar:', msg)
    tray.setToolTip('RIZER Agent — ERRO')
    tray.setContextMenu(buildContextMenu(`✗  Erro: ${msg.slice(0, 60)}`))
    dialog.showErrorBox('RIZER Agent — Erro de inicialização', msg)
  }
})

app.on('window-all-closed', () => { /* mantém vivo — só sai pelo tray */ })
