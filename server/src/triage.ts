import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'

import type {
  AiMode,
  DepartmentRoute,
  PatientQueueItem,
  PriorityLevel,
  QueueStage,
  TriageOutcome,
  TriageRequest,
  TriageResponse,
  TrendState,
} from './types.js'

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' })

export const triageRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  age: z.number().int().min(0).max(120),
  sex: z.enum(['Male', 'Female', 'Other']),
  arrivalMode: z.enum(['Walk-in', 'Wheelchair', 'Ambulance']),
  chiefComplaint: z.string().trim().min(5).max(200),
  symptoms: z.array(z.string().trim().min(2).max(60)).min(1).max(10),
  vitals: z.object({
    heartRate: z.number().int().min(30).max(220),
    spo2: z.number().int().min(60).max(100),
    systolic: z.number().int().min(60).max(240),
    diastolic: z.number().int().min(40).max(160),
    temperature: z.number().min(32).max(43),
    respiratoryRate: z.number().int().min(8).max(50),
  }),
})

const triageOutcomeSchema = z.object({
  severityScore: z.number().min(0).max(100),
  priorityLevel: z.enum(['Critical', 'High', 'Moderate', 'Low']),
  queueStage: z.enum([
    'Immediate response',
    'Physician review',
    'Vitals watch',
    'Diagnostics pending',
    'Ready for transfer',
  ]),
  estimatedWaitMinutes: z.number().int().min(0).max(240),
  department: z.object({
    primary: z.string().min(3),
    secondary: z.string().min(3),
  }),
  alerts: z.array(z.string().min(3)).max(5),
  summary: z.string().min(10).max(220),
  triageReasoning: z.string().min(24).max(420),
  recommendedActions: z.array(z.string().min(4)).min(2).max(4),
  trend: z.enum(['Rising', 'Stable', 'Falling']),
})

const triageJsonSchema = {
  type: 'object',
  properties: {
    severityScore: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
      description: 'Urgency score where 100 means immediate intervention.',
    },
    priorityLevel: {
      type: 'string',
      enum: ['Critical', 'High', 'Moderate', 'Low'],
      description: 'Priority label used by the command center queue.',
    },
    queueStage: {
      type: 'string',
      enum: [
        'Immediate response',
        'Physician review',
        'Vitals watch',
        'Diagnostics pending',
        'Ready for transfer',
      ],
      description: 'Best next queue lane for this patient.',
    },
    estimatedWaitMinutes: {
      type: 'integer',
      minimum: 0,
      maximum: 240,
      description: 'Estimated time until clinician touchpoint.',
    },
    department: {
      type: 'object',
      properties: {
        primary: {
          type: 'string',
          description: 'Best primary department to receive the patient.',
        },
        secondary: {
          type: 'string',
          description: 'Fallback or supporting department.',
        },
      },
      required: ['primary', 'secondary'],
      additionalProperties: false,
    },
    alerts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short list of command-center alerts.',
    },
    summary: {
      type: 'string',
      description: 'One-sentence operational summary for the queue board.',
    },
    triageReasoning: {
      type: 'string',
      description: 'Short rationale explaining the urgency and routing choice.',
    },
    recommendedActions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Immediate next actions for the care team.',
    },
    trend: {
      type: 'string',
      enum: ['Rising', 'Stable', 'Falling'],
      description: 'Expected near-term risk trend based on current presentation.',
    },
  },
  required: [
    'severityScore',
    'priorityLevel',
    'queueStage',
    'estimatedWaitMinutes',
    'department',
    'alerts',
    'summary',
    'triageReasoning',
    'recommendedActions',
    'trend',
  ],
  additionalProperties: false,
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
}

export function getConfiguredModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash'
}

export async function triagePatient(input: TriageRequest): Promise<{
  aiMode: AiMode
  patient: PatientQueueItem
  clinicianHandoff: string
  dispatchNote: string
  safetyNote: string
}> {
  let aiMode: AiMode = 'demo'
  let outcome: TriageOutcome

  if (hasGeminiKey()) {
    try {
      outcome = await generateGeminiTriage(input)
      aiMode = 'gemini'
    } catch (error) {
      console.error('Gemini triage failed, using heuristic fallback.', error)
      outcome = heuristicTriage(input)
    }
  } else {
    outcome = heuristicTriage(input)
  }

  const patient = buildPatientRecord(input, outcome)

  return {
    aiMode,
    patient,
    clinicianHandoff: `${patient.priorityLevel} priority. Route ${patient.name} to ${patient.department.primary}. ${patient.triageReasoning}`,
    dispatchNote: `${patient.department.primary} receives the patient with ${patient.alerts.length > 0 ? patient.alerts[0].toLowerCase() : 'no critical trigger'} and an estimated wait of ${patient.estimatedWaitMinutes} minute(s).`,
    safetyNote:
      'Decision-support only. Final triage and treatment decisions must be confirmed by licensed clinicians.',
  }
}

export async function buildTriageResponse(
  input: TriageRequest,
  dashboard: TriageResponse['dashboard'],
): Promise<TriageResponse> {
  const result = await triagePatient(input)

  return {
    ...result,
    dashboard,
  }
}

async function generateGeminiTriage(input: TriageRequest): Promise<TriageOutcome> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

  if (!apiKey) {
    throw new Error('Gemini API key missing')
  }

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: getConfiguredModel(),
    contents: buildPrompt(input),
    config: {
      responseMimeType: 'application/json',
      responseSchema: triageJsonSchema,
    },
  })

  if (!response.text) {
    throw new Error('Gemini returned an empty response')
  }

  return triageOutcomeSchema.parse(JSON.parse(response.text))
}

function buildPatientRecord(
  input: TriageRequest,
  outcome: TriageOutcome,
): PatientQueueItem {
  return {
    id: `OPD-${String(Math.floor(1000 + Math.random() * 9000))}`,
    name: input.name,
    age: input.age,
    sex: input.sex,
    chiefComplaint: input.chiefComplaint,
    symptoms: input.symptoms,
    arrivalMode: input.arrivalMode,
    severityScore: outcome.severityScore,
    priorityLevel: outcome.priorityLevel,
    queueStage: outcome.queueStage,
    estimatedWaitMinutes: outcome.estimatedWaitMinutes,
    department: outcome.department,
    alerts: outcome.alerts,
    summary: outcome.summary,
    triageReasoning: outcome.triageReasoning,
    recommendedActions: outcome.recommendedActions,
    vitals: input.vitals,
    trend: outcome.trend,
    registeredAt: new Date().toISOString(),
  }
}

function buildPrompt(input: TriageRequest) {
  return `
You are a clinical decision-support triage assistant for King George's Medical University in Lucknow.
This output will be reviewed by human clinicians. It is not a diagnosis and must stay concise, operational, and safety-first.

Evaluate the patient for:
- symptom-based triage scoring
- command-center priority queue placement
- department routing suggestions
- near-term monitoring trend

Guidelines:
- Be conservative when chest pain, stroke signs, severe breathlessness, shock, seizures, or active bleeding are present.
- Use "Critical" only when rapid bedside intervention is justified.
- Keep department names practical for a public tertiary-care command hub.
- Return only valid JSON.

Patient data:
${JSON.stringify(input, null, 2)}
  `.trim()
}

function heuristicTriage(input: TriageRequest): TriageOutcome {
  const keywords = `${input.chiefComplaint} ${input.symptoms.join(' ')}`.toLowerCase()
  const route = routeDepartment(keywords)

  let score = 18

  if (input.age >= 65) {
    score += 8
  } else if (input.age <= 5) {
    score += 7
  }

  if (input.arrivalMode === 'Ambulance') {
    score += 14
  } else if (input.arrivalMode === 'Wheelchair') {
    score += 6
  }

  const riskTriggers = [
    ['chest pain', 26],
    ['shortness of breath', 24],
    ['breathlessness', 24],
    ['slurred speech', 30],
    ['weakness', 16],
    ['bleeding', 24],
    ['seizure', 30],
    ['unconscious', 34],
    ['vomiting', 10],
    ['fever', 8],
    ['fracture', 10],
  ] as const

  for (const [term, weight] of riskTriggers) {
    if (keywords.includes(term)) {
      score += weight
    }
  }

  if (input.vitals.spo2 <= 90) {
    score += 28
  } else if (input.vitals.spo2 <= 93) {
    score += 14
  }

  if (input.vitals.heartRate >= 125 || input.vitals.heartRate <= 45) {
    score += 16
  } else if (input.vitals.heartRate >= 110) {
    score += 8
  }

  if (input.vitals.systolic <= 90) {
    score += 25
  } else if (input.vitals.systolic <= 100 || input.vitals.systolic >= 170) {
    score += 10
  }

  if (input.vitals.temperature >= 39) {
    score += 10
  }

  if (input.vitals.respiratoryRate >= 28) {
    score += 18
  } else if (input.vitals.respiratoryRate >= 22) {
    score += 8
  }

  score = Math.max(0, Math.min(100, score))

  const priorityLevel = mapPriority(score)
  const trend = inferTrend(input, score)
  const queueStage = mapQueueStage(priorityLevel, keywords)
  const alerts = buildAlerts(input, keywords, priorityLevel)
  const recommendedActions = buildActions(route, keywords, priorityLevel)

  return {
    severityScore: score,
    priorityLevel,
    queueStage,
    estimatedWaitMinutes: waitEstimate(priorityLevel),
    department: route,
    alerts,
    summary: `${capitalize(priorityLevel)}-acuity ${input.chiefComplaint.toLowerCase()} case with ${input.arrivalMode.toLowerCase()} arrival and ${trend.toLowerCase()} monitoring trend.`,
    triageReasoning: `${input.name} shows a severity score of ${score} based on symptoms, arrival mode, and vital instability markers. Routing to ${route.primary} prioritizes the most likely intervention pathway while ${route.secondary} remains the overflow or support service.`,
    recommendedActions,
    trend,
  }
}

function routeDepartment(keywords: string): DepartmentRoute {
  if (
    keywords.includes('chest pain') ||
    keywords.includes('palpitation') ||
    keywords.includes('sweating')
  ) {
    return { primary: 'Cardiology', secondary: 'Emergency Medicine' }
  }

  if (
    keywords.includes('shortness of breath') ||
    keywords.includes('breathlessness') ||
    keywords.includes('wheezing') ||
    keywords.includes('cough')
  ) {
    return { primary: 'Pulmonology', secondary: 'Emergency Medicine' }
  }

  if (
    keywords.includes('slurred speech') ||
    keywords.includes('seizure') ||
    keywords.includes('facial droop') ||
    keywords.includes('weakness')
  ) {
    return { primary: 'Neurology', secondary: 'Emergency Medicine' }
  }

  if (
    keywords.includes('fracture') ||
    keywords.includes('ankle') ||
    keywords.includes('fall') ||
    keywords.includes('injury')
  ) {
    return { primary: 'Orthopedics', secondary: 'Emergency Medicine' }
  }

  return { primary: 'General Medicine', secondary: 'Emergency Medicine' }
}

function mapPriority(score: number): PriorityLevel {
  if (score >= 85) {
    return 'Critical'
  }

  if (score >= 60) {
    return 'High'
  }

  if (score >= 35) {
    return 'Moderate'
  }

  return 'Low'
}

function mapQueueStage(priorityLevel: PriorityLevel, keywords: string): QueueStage {
  if (priorityLevel === 'Critical') {
    return 'Immediate response'
  }

  if (
    priorityLevel === 'High' &&
    (keywords.includes('breath') || keywords.includes('chest') || keywords.includes('stroke'))
  ) {
    return 'Vitals watch'
  }

  if (priorityLevel === 'High') {
    return 'Physician review'
  }

  if (priorityLevel === 'Moderate') {
    return 'Diagnostics pending'
  }

  return 'Ready for transfer'
}

function inferTrend(input: TriageRequest, score: number): TrendState {
  const unstableSignals = [
    input.vitals.spo2 <= 93,
    input.vitals.systolic <= 100,
    input.vitals.heartRate >= 110,
    input.vitals.respiratoryRate >= 24,
    input.vitals.temperature >= 39,
    score >= 85,
  ].filter(Boolean).length

  if (unstableSignals >= 3) {
    return 'Rising'
  }

  if (unstableSignals === 2) {
    return 'Stable'
  }

  return 'Falling'
}

function buildAlerts(
  input: TriageRequest,
  keywords: string,
  priorityLevel: PriorityLevel,
) {
  const alerts = new Set<string>()

  if (priorityLevel === 'Critical') {
    alerts.add('Immediate clinician review')
  }

  if (input.vitals.spo2 <= 93) {
    alerts.add('Hypoxia watch')
  }

  if (input.vitals.systolic <= 90) {
    alerts.add('Possible hemodynamic compromise')
  }

  if (keywords.includes('slurred speech') || keywords.includes('facial droop')) {
    alerts.add('Possible stroke code')
  }

  if (keywords.includes('chest pain')) {
    alerts.add('ACS protocol candidate')
  }

  if (keywords.includes('breath')) {
    alerts.add('Respiratory monitoring priority')
  }

  return Array.from(alerts).slice(0, 4)
}

function buildActions(
  route: DepartmentRoute,
  keywords: string,
  priorityLevel: PriorityLevel,
) {
  const actions = [`Route to ${route.primary} desk`]

  if (priorityLevel === 'Critical') {
    actions.unshift('Shift to monitored resuscitation bay')
  }

  if (keywords.includes('chest pain')) {
    actions.push('Trigger ECG and cardiac enzyme workflow')
  } else if (keywords.includes('breath')) {
    actions.push('Start continuous pulse oximetry')
  } else if (keywords.includes('slurred speech') || keywords.includes('weakness')) {
    actions.push('Prepare urgent neuroimaging referral')
  } else if (keywords.includes('fracture') || keywords.includes('injury')) {
    actions.push('Prepare imaging and immobilization support')
  } else {
    actions.push('Queue basic physician evaluation')
  }

  actions.push(`Keep ${route.secondary} on standby`)

  return actions.slice(0, 4)
}

function waitEstimate(priorityLevel: PriorityLevel) {
  switch (priorityLevel) {
    case 'Critical':
      return 0
    case 'High':
      return 8
    case 'Moderate':
      return 24
    case 'Low':
      return 42
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
