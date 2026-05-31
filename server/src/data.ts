import type {
  AiMode,
  CommandAlert,
  DashboardMetrics,
  DashboardSnapshot,
  DepartmentLoad,
  PatientQueueItem,
  PatientVitals,
  PriorityLevel,
  TelemetryPoint,
  TrendState,
} from './types.js'

const FACILITY_NAME = 'KGMU AI Triage Agent - Lucknow Command Hub'

const priorityWeights: Record<PriorityLevel, number> = {
  Critical: 4,
  High: 3,
  Moderate: 2,
  Low: 1,
}

const departmentRoster: Record<
  string,
  { baseOccupancy: number; staffedUnits: number; nextWindow: string }
> = {
  'Emergency Medicine': {
    baseOccupancy: 84,
    staffedUnits: 9,
    nextWindow: '2 bays clear in 6 min',
  },
  Cardiology: {
    baseOccupancy: 71,
    staffedUnits: 5,
    nextWindow: 'Cath review slot in 14 min',
  },
  Pulmonology: {
    baseOccupancy: 68,
    staffedUnits: 4,
    nextWindow: 'Oxygen pod in 9 min',
  },
  Neurology: {
    baseOccupancy: 63,
    staffedUnits: 3,
    nextWindow: 'Stroke desk in 12 min',
  },
  Orthopedics: {
    baseOccupancy: 57,
    staffedUnits: 4,
    nextWindow: 'Procedure room in 18 min',
  },
  'General Medicine': {
    baseOccupancy: 66,
    staffedUnits: 8,
    nextWindow: 'Review cubicle in 11 min',
  },
}

const seededQueue: PatientQueueItem[] = [
  {
    id: 'OPD-1182',
    name: 'Farzana Ali',
    age: 64,
    sex: 'Female',
    chiefComplaint: 'Severe chest pain with perspiration',
    symptoms: ['chest pain', 'sweating', 'breathlessness'],
    arrivalMode: 'Wheelchair',
    severityScore: 92,
    priorityLevel: 'Critical',
    queueStage: 'Immediate response',
    estimatedWaitMinutes: 1,
    department: { primary: 'Cardiology', secondary: 'Emergency Medicine' },
    alerts: ['Possible acute coronary syndrome', 'Oxygen saturation falling'],
    summary: 'Unstable chest pain pattern with diaphoresis and falling oxygenation.',
    triageReasoning:
      'High-risk ischemic symptoms plus borderline hypoxia place this patient in the immediate response band.',
    recommendedActions: [
      'Transfer to monitored bay',
      'Activate ECG and troponin pathway',
      'Notify cardiology resident',
    ],
    vitals: {
      heartRate: 118,
      spo2: 91,
      systolic: 94,
      diastolic: 62,
      temperature: 37.1,
      respiratoryRate: 28,
    },
    trend: 'Rising',
    registeredAt: minutesAgo(4),
  },
  {
    id: 'OPD-1180',
    name: 'Ravi Verma',
    age: 43,
    sex: 'Male',
    chiefComplaint: 'Acute wheeze and shortness of breath',
    symptoms: ['shortness of breath', 'wheezing', 'cough'],
    arrivalMode: 'Walk-in',
    severityScore: 79,
    priorityLevel: 'High',
    queueStage: 'Vitals watch',
    estimatedWaitMinutes: 7,
    department: { primary: 'Pulmonology', secondary: 'Emergency Medicine' },
    alerts: ['Escalating respiratory effort'],
    summary: 'Respiratory distress with elevated work of breathing.',
    triageReasoning:
      'Sustained tachypnea and low-normal oxygen saturation warrant fast review and close observation.',
    recommendedActions: [
      'Start neb-ready bed prep',
      'Keep pulse oximetry live',
      'Prepare bronchodilator protocol',
    ],
    vitals: {
      heartRate: 109,
      spo2: 93,
      systolic: 128,
      diastolic: 78,
      temperature: 37.6,
      respiratoryRate: 30,
    },
    trend: 'Rising',
    registeredAt: minutesAgo(9),
  },
  {
    id: 'OPD-1178',
    name: 'Neha Singh',
    age: 28,
    sex: 'Female',
    chiefComplaint: 'High fever and persistent vomiting',
    symptoms: ['fever', 'vomiting', 'weakness'],
    arrivalMode: 'Walk-in',
    severityScore: 63,
    priorityLevel: 'High',
    queueStage: 'Physician review',
    estimatedWaitMinutes: 11,
    department: { primary: 'General Medicine', secondary: 'Emergency Medicine' },
    alerts: ['Possible dehydration'],
    summary: 'Febrile illness with ongoing emesis and dehydration risk.',
    triageReasoning:
      'Tachycardia and high fever elevate risk even without overt shock parameters.',
    recommendedActions: [
      'Secure rapid physician review',
      'Prepare IV fluids',
      'Flag for infection workup',
    ],
    vitals: {
      heartRate: 114,
      spo2: 97,
      systolic: 106,
      diastolic: 70,
      temperature: 39.2,
      respiratoryRate: 22,
    },
    trend: 'Stable',
    registeredAt: minutesAgo(14),
  },
  {
    id: 'OPD-1177',
    name: 'Suresh Tiwari',
    age: 71,
    sex: 'Male',
    chiefComplaint: 'Slurred speech and left arm weakness',
    symptoms: ['slurred speech', 'weakness', 'facial droop'],
    arrivalMode: 'Ambulance',
    severityScore: 88,
    priorityLevel: 'Critical',
    queueStage: 'Immediate response',
    estimatedWaitMinutes: 0,
    department: { primary: 'Neurology', secondary: 'Emergency Medicine' },
    alerts: ['Possible stroke code'],
    summary: 'Focal neurological deficit with sudden onset symptoms.',
    triageReasoning:
      'Stroke-like presentation and ambulance arrival should bypass ordinary waiting lanes.',
    recommendedActions: [
      'Activate stroke pathway',
      'Secure imaging slot',
      'Keep blood pressure trend visible',
    ],
    vitals: {
      heartRate: 96,
      spo2: 95,
      systolic: 168,
      diastolic: 96,
      temperature: 36.8,
      respiratoryRate: 20,
    },
    trend: 'Rising',
    registeredAt: minutesAgo(3),
  },
  {
    id: 'OPD-1174',
    name: 'Pooja Maurya',
    age: 36,
    sex: 'Female',
    chiefComplaint: 'Ankle deformity after road traffic fall',
    symptoms: ['ankle pain', 'swelling', 'inability to bear weight'],
    arrivalMode: 'Wheelchair',
    severityScore: 46,
    priorityLevel: 'Moderate',
    queueStage: 'Diagnostics pending',
    estimatedWaitMinutes: 26,
    department: { primary: 'Orthopedics', secondary: 'Emergency Medicine' },
    alerts: ['Imaging slot requested'],
    summary: 'Orthopedic injury with probable fracture and stable hemodynamics.',
    triageReasoning:
      'Pain and deformity need fast imaging, but the overall physiology is currently stable.',
    recommendedActions: [
      'Prioritize X-ray queue',
      'Immobilize affected limb',
      'Track pain reassessment',
    ],
    vitals: {
      heartRate: 98,
      spo2: 99,
      systolic: 122,
      diastolic: 82,
      temperature: 36.9,
      respiratoryRate: 18,
    },
    trend: 'Stable',
    registeredAt: minutesAgo(18),
  },
  {
    id: 'OPD-1170',
    name: 'Aman Khan',
    age: 22,
    sex: 'Male',
    chiefComplaint: 'Sore throat and low-grade fever',
    symptoms: ['sore throat', 'fever', 'body ache'],
    arrivalMode: 'Walk-in',
    severityScore: 24,
    priorityLevel: 'Low',
    queueStage: 'Ready for transfer',
    estimatedWaitMinutes: 44,
    department: { primary: 'General Medicine', secondary: 'Pulmonology' },
    alerts: [],
    summary: 'Mild upper-respiratory presentation without instability markers.',
    triageReasoning:
      'No dangerous vital sign pattern is visible, so this patient can safely remain in the lower-priority queue.',
    recommendedActions: [
      'Route to low-acuity consult desk',
      'Provide hydration guidance',
      'Watch for fever progression',
    ],
    vitals: {
      heartRate: 84,
      spo2: 99,
      systolic: 118,
      diastolic: 74,
      temperature: 37.8,
      respiratoryRate: 16,
    },
    trend: 'Falling',
    registeredAt: minutesAgo(27),
  },
]

let queueState = sortQueue(structuredClone(seededQueue))

export function addPatientToQueue(patient: PatientQueueItem) {
  queueState = sortQueue([patient, ...queueState])
}

export function getDashboardSnapshot(aiMode: AiMode): DashboardSnapshot {
  queueState = sortQueue(queueState.map(tuneVitals))

  const metrics = buildMetrics(queueState)
  const departments = buildDepartments(queueState)
  const alerts = buildAlerts(queueState, departments)

  return {
    generatedAt: new Date().toISOString(),
    aiMode,
    facility: FACILITY_NAME,
    metrics,
    queue: queueState,
    departments,
    alerts,
    telemetry: buildTelemetry(metrics),
  }
}

function sortQueue(queue: PatientQueueItem[]) {
  return [...queue].sort((left, right) => {
    const priorityDelta =
      priorityWeights[right.priorityLevel] - priorityWeights[left.priorityLevel]

    if (priorityDelta !== 0) {
      return priorityDelta
    }

    if (right.severityScore !== left.severityScore) {
      return right.severityScore - left.severityScore
    }

    return new Date(right.registeredAt).getTime() - new Date(left.registeredAt).getTime()
  })
}

function tuneVitals(patient: PatientQueueItem): PatientQueueItem {
  const nextVitals = {
    heartRate: clamp(
      patient.vitals.heartRate + drift(patient.trend === 'Rising' ? 4 : 2),
      58,
      150,
    ),
    spo2: clamp(
      patient.vitals.spo2 + drift(patient.trend === 'Rising' ? 2 : 1) * -1,
      86,
      100,
    ),
    systolic: clamp(
      patient.vitals.systolic + drift(patient.trend === 'Rising' ? 6 : 3),
      82,
      190,
    ),
    diastolic: clamp(patient.vitals.diastolic + drift(3), 50, 118),
    temperature: clamp(
      round(patient.vitals.temperature + drift(patient.trend === 'Rising' ? 0.2 : 0.1)),
      36.0,
      40.4,
    ),
    respiratoryRate: clamp(
      patient.vitals.respiratoryRate + drift(patient.trend === 'Rising' ? 3 : 2),
      12,
      36,
    ),
  }

  const nextTrend = deriveTrend(nextVitals)

  return {
    ...patient,
    vitals: nextVitals,
    trend: nextTrend,
  }
}

function buildMetrics(queue: PatientQueueItem[]): DashboardMetrics {
  const criticalCases = queue.filter((patient) => patient.priorityLevel === 'Critical').length
  const monitoredPatients = queue.filter(
    (patient) => patient.trend !== 'Falling' || patient.alerts.length > 0,
  ).length
  const avgWaitMinutes = Math.round(
    queue.reduce((total, patient) => total + patient.estimatedWaitMinutes, 0) /
      Math.max(queue.length, 1),
  )

  return {
    totalQueue: queue.length,
    criticalCases,
    monitoredPatients,
    avgWaitMinutes,
    escalationRate: Math.round((criticalCases / Math.max(queue.length, 1)) * 100),
    routedThisHour: queue.length + 9,
  }
}

function buildDepartments(queue: PatientQueueItem[]): DepartmentLoad[] {
  return Object.entries(departmentRoster)
    .map(([name, config]) => {
      const assigned = queue.filter(
        (patient) =>
          patient.department.primary === name || patient.department.secondary === name,
      )
      const criticalInDept = assigned.filter(
        (patient) => patient.priorityLevel === 'Critical',
      ).length
      const occupancy = clamp(
        config.baseOccupancy + assigned.length * 4 + criticalInDept * 5,
        28,
        98,
      )

      return {
        name,
        occupancy,
        queue: assigned.length,
        staffedUnits: config.staffedUnits,
        pressure: (
          occupancy >= 85 ? 'Saturated' : occupancy >= 70 ? 'Busy' : 'Stable'
        ) as DepartmentLoad['pressure'],
        nextWindow: config.nextWindow,
      }
    })
    .sort((left, right) => right.occupancy - left.occupancy)
}

function buildAlerts(
  queue: PatientQueueItem[],
  departments: DepartmentLoad[],
): CommandAlert[] {
  const patientAlerts = queue
    .filter((patient) => patient.priorityLevel !== 'Low' || patient.vitals.spo2 <= 93)
    .slice(0, 4)
    .map<CommandAlert>((patient) => ({
      id: `${patient.id}-alert`,
      patientId: patient.id,
      title:
        patient.priorityLevel === 'Critical'
          ? `${patient.name} requires immediate command action`
          : `${patient.name} remains on monitored watch`,
      description: `${patient.summary} Route: ${patient.department.primary}.`,
      tone: patient.priorityLevel === 'Critical' ? 'critical' : 'watch',
      issuedAt: patient.registeredAt,
    }))

  const busiestDepartment = departments[0]

  const systemAlert: CommandAlert = {
    id: 'ops-routing',
    title: `${busiestDepartment.name} under highest load`,
    description: `${busiestDepartment.occupancy}% occupancy with ${busiestDepartment.queue} patients routed. Consider overflow balancing.`,
    tone: 'info',
    issuedAt: new Date().toISOString(),
  }

  return [systemAlert, ...patientAlerts]
}

function buildTelemetry(metrics: DashboardMetrics): TelemetryPoint[] {
  const labels = ['-50m', '-40m', '-30m', '-20m', '-10m', 'Now']

  return labels.map((label, index) => ({
    label,
    critical: clamp(
      Math.round(metrics.criticalCases + Math.sin(index * 1.2) * 1.4 + index / 4),
      1,
      metrics.criticalCases + 3,
    ),
    monitored: clamp(
      Math.round(metrics.monitoredPatients - 3 + Math.cos(index * 0.9) * 2.2 + index),
      4,
      metrics.monitoredPatients + 4,
    ),
    routed: clamp(
      Math.round(metrics.routedThisHour - 7 + index * 2 + Math.sin(index) * 1.5),
      5,
      metrics.routedThisHour + 3,
    ),
  }))
}

function deriveTrend(vitals: PatientVitals): TrendState {
  const abnormalSignals = [
    vitals.spo2 <= 93,
    vitals.heartRate >= 110,
    vitals.respiratoryRate >= 24,
    vitals.systolic <= 95 || vitals.systolic >= 165,
    vitals.temperature >= 38.7,
  ].filter(Boolean).length

  if (abnormalSignals >= 3) {
    return 'Rising'
  }

  if (abnormalSignals === 2) {
    return 'Stable'
  }

  return 'Falling'
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function drift(amount: number) {
  return Math.round((Math.random() - 0.5) * amount)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
