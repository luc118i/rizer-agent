import express from 'express'
import cors from 'cors'
import { automateOccurrence, fillMedidaService, countFaltaTratativa, verifyOccurrenceService } from './automation/service'

export async function startServer(port: number): Promise<void> {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', agent: 'rizer-agent', version: '1.0.0' })
  })

  app.post('/automation/disciplinary', async (req, res) => {
    try {
      const result = await automateOccurrence(req.body)
      res.json(result)
    } catch (err: any) {
      console.error('[server] /automation/disciplinary erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/automation/fill-medida', async (req, res) => {
    try {
      await fillMedidaService(req.body)
      const pendentes = await countFaltaTratativa()
      res.json({ pendentes })
    } catch (err: any) {
      console.error('[server] /automation/fill-medida erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/automation/verify', async (req, res) => {
    try {
      const result = await verifyOccurrenceService(req.body)
      res.json(result)
    } catch (err: any) {
      console.error('[server] /automation/verify erro:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/automation/tratativas-pendentes', async (_req, res) => {
    try {
      const pendentes = await countFaltaTratativa()
      res.json({ pendentes })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`[server] RIZER Agent escutando em http://127.0.0.1:${port}`)
      resolve()
    })
    server.on('error', reject)
  })
}
