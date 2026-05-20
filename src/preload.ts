import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('agent', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke('save-config', cfg),
  pickJsonFile: () => ipcRenderer.invoke('pick-json-file'),
  testConnection: (cfg: unknown) => ipcRenderer.invoke('test-connection', cfg),
})
