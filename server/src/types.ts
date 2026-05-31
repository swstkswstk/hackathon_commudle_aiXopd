export type PriorityLevel = 'Critical' | 'High' | 'Moderate' | 'Low'
export type TrendState = 'Rising' | 'Stable' | 'Falling'
export type QueueStage =
  | 'Immediate response'
  | 'Physician review'
  | 'Vitals watch'
  | 'Diagnostics pending'
  | 'Ready for transfer'
export type ArrivalMode = 'Walk-in' | 'Wheelchair' | 'Ambulance'
export type Sex = 'Male' | 'Female' | 'Other'
export type AiMode = 'gemini' | 'demo'

export interface PatientVitals {
  heartRate: number
  spo2: number
  systolic: number
  diastolic: number
  temperature: number
  respiratoryRate: number
}

export interface DepartmentRoute {
  primary: string
  secondary: string
}

export interface PatientQueueItem {
  id: string
  name: string
  age: number
  sex: Sex
  chiefComplaint: string
  symptoms: string[]
  arrivalMode: ArrivalMode
  severityScore: number
  priorityLevel: PriorityLevel
  queueStage: QueueStage
  estimatedWaitMinutes: number
  department: DepartmentRoute
  alerts: string[]
  summary: string
  triageReasoning: string
  recommendedActions: string[]
  vitals: PatientVitals
  trend: TrendState
  registeredAt: string
}

export interface DepartmentLoad {
  name: string
  occupancy: number
  queue: number
  staffedUnits: number
  pressure: 'Stable' | 'Busy' | 'Saturated'
  nextWindow: string
}

export interface CommandAlert {
  id: string
  title: string
  description: string
  tone: 'critical' | 'watch' | 'info'
  patientId?: string
  issuedAt: string
}

export interface TelemetryPoint {
  label: string
  critical: number
  monitored: number
  routed: number
}

export interface DashboardMetrics {
  totalQueue: number
  criticalCases: number
  monitoredPatients: number
  avgWaitMinutes: number
  escalationRate: number
  routedThisHour: number
}

export interface DashboardSnapshot {
  generatedAt: string
  aiMode: AiMode
  facility: string
  metrics: DashboardMetrics
  queue: PatientQueueItem[]
  departments: DepartmentLoad[]
  alerts: CommandAlert[]
  telemetry: TelemetryPoint[]
}

export interface TriageRequest {
  name: string
  age: number
  sex: Sex
  arrivalMode: ArrivalMode
  chiefComplaint: string
  symptoms: string[]
  vitals: PatientVitals
}

export interface TriageOutcome {
  severityScore: number
  priorityLevel: PriorityLevel
  queueStage: QueueStage
  estimatedWaitMinutes: number
  department: DepartmentRoute
  alerts: string[]
  summary: string
  triageReasoning: string
  recommendedActions: string[]
  trend: TrendState
}

export interface TriageResponse {
  aiMode: AiMode
  patient: PatientQueueItem
  dashboard: DashboardSnapshot
  clinicianHandoff: string
  dispatchNote: string
  safetyNote: string
}
