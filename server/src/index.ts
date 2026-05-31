import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

import { addPatientToQueue, getDashboardSnapshot } from './data.js'
import {
  getConfiguredModel,
  hasGeminiKey,
  triagePatient,
  triageRequestSchema,
} from './triage.js'

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' })

const port = Number(process.env.PORT || 8787)
const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/status', (_request, response) => {
  response.json({
    ok: true,
    aiMode: hasGeminiKey() ? 'gemini' : 'demo',
    model: getConfiguredModel(),
    keyConfigured: hasGeminiKey(),
  })
})

app.get('/api/dashboard', (_request, response) => {
  response.json(getDashboardSnapshot(hasGeminiKey() ? 'gemini' : 'demo'))
})

app.post('/api/assess', async (request, response) => {
  const parsed = triageRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({
      message: 'Invalid assessment payload.',
      issues: parsed.error.flatten(),
    })
    return
  }

  const result = await triagePatient(parsed.data)
  response.status(200).json(result)
})

app.post('/api/triage', async (request, response) => {
  const parsed = triageRequestSchema.safeParse(request.body)

  if (!parsed.success) {
    response.status(400).json({
      message: 'Invalid triage payload.',
      issues: parsed.error.flatten(),
    })
    return
  }

  const result = await triagePatient(parsed.data)
  addPatientToQueue(result.patient)

  response.status(201).json({
    ...result,
    dashboard: getDashboardSnapshot(result.aiMode),
  })
})

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error)
    response.status(500).json({
      message: 'Command hub backend failed to process the request.',
    })
  },
)

app.listen(port, () => {
  console.log(`KGMU command hub API listening on http://localhost:${port}`)
})
