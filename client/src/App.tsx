import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import type { FormEvent } from 'react'

import './App.css'
import type {
  ArrivalMode,
  AssessmentResponse,
  DashboardSnapshot,
  DepartmentLoad,
  PatientQueueItem,
  PatientVitals,
  TriageResponse,
} from './types'

type SeverityBand = 'critical' | 'urgent' | 'stable'

type FormState = {
  name: string
  age: string
  sex: 'Male' | 'Female' | 'Other'
  arrivalMode: ArrivalMode
  chiefComplaint: string
  symptoms: string[]
  vitals: Record<keyof PatientVitals, string>
}

type ChatMessage = {
  id: string
  role: 'ai' | 'user'
  text: string
}

const symptomCatalog = [
  'chest pain',
  'breathlessness',
  'fever',
  'dizziness',
  'vomiting',
  'slurred speech',
  'weakness',
  'bleeding',
  'wheezing',
  'palpitations',
  'trauma',
  'dehydration',
]

const navigationItems = ['Queue', 'Departments', 'Routing', 'AI Chat']

const defaultForm: FormState = {
  name: 'Sajida Bano',
  age: '58',
  sex: 'Female',
  arrivalMode: 'Wheelchair',
  chiefComplaint: 'Sudden chest tightness with sweating and dizziness',
  symptoms: ['chest pain', 'breathlessness', 'dizziness'],
  vitals: {
    heartRate: '122',
    spo2: '92',
    systolic: '96',
    diastolic: '64',
    temperature: '37.2',
    respiratoryRate: '29',
  },
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null)
  const [latestTriage, setLatestTriage] = useState<TriageResponse | null>(null)
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [chatHistoryByPatient, setChatHistoryByPatient] = useState<
    Record<string, ChatMessage[]>
  >({})
  const [chatInput, setChatInput] = useState('')
  const [form, setForm] = useState<FormState>(defaultForm)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => new Date())

  const deferredSearch = useDeferredValue(search)

  const pollDashboard = useEffectEvent(async () => {
    setRefreshing(true)

    try {
      const payload = await requestDashboard()
      setDashboard(payload)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Command hub sync failed.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  })

  useEffect(() => {
    let cancelled = false

    const loadInitialDashboard = async () => {
      try {
        const payload = await requestDashboard()

        if (cancelled) {
          return
        }

        setDashboard(payload)
        setError(null)
      } catch (requestError) {
        if (cancelled) {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Command hub sync failed.',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialDashboard()

    const refreshTimer = window.setInterval(() => {
      void pollDashboard()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setClock(new Date())
    }, 1000)

    return () => window.clearInterval(clockTimer)
  }, [])

  const queue = sortQueue(dashboard?.queue ?? [], deferredSearch)

  const selectedPatient =
    dashboard?.queue.find((patient) => patient.id === selectedPatientId) ??
    queue[0] ??
    dashboard?.queue[0] ??
    null

  const departmentSummary = dashboard?.departments.slice(0, 6) ?? []
  const criticalCount = queue.filter((patient) => getSeverityBand(patient) === 'critical').length
  const urgentCount = queue.filter((patient) => getSeverityBand(patient) === 'urgent').length
  const stableCount = queue.filter((patient) => getSeverityBand(patient) === 'stable').length
  const avgWait =
    queue.length > 0
      ? Math.round(
          queue.reduce((total, patient) => total + patient.estimatedWaitMinutes, 0) /
            queue.length,
        )
      : 0

  const topCriticalId = queue.find((patient) => getSeverityBand(patient) === 'critical')?.id
  const modalBand =
    assessment?.patient ? getSeverityBand(assessment.patient) : estimateFormBand(form)
  const selectedBand = selectedPatient ? getSeverityBand(selectedPatient) : 'stable'
  const scoreBreakdown = selectedPatient ? buildScoreBreakdown(selectedPatient) : []
  const selectedChatMessages = selectedPatient
    ? chatHistoryByPatient[selectedPatient.id] ??
      buildInitialChat(selectedPatient, latestTriage)
    : []

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar__brand">KGMU AI TRIAGE COMMAND HUB</div>
        <div className="topbar__stats">
          <TopStat label="Critical" value={criticalCount} tone="critical" />
          <TopStat label="Urgent" value={urgentCount} tone="urgent" />
          <TopStat label="Stable" value={stableCount} tone="stable" />
          <TopStat label="Avg Wait" value={`${avgWait}m`} tone="neutral" />
        </div>
        <div className="topbar__clock">
          {clock.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata',
          })}
        </div>
      </header>

      <div className="command-shell">
        <aside className="sidebar">
          <div className="sidebar__section">
            <div className="section-label">Navigation</div>
            <nav className="sidebar-nav">
              {navigationItems.map((item) => (
                <button key={item} className="nav-button" type="button">
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div className="section-divider" />

          <div className="sidebar__section">
            <button className="sidebar-action" type="button" onClick={handleOpenModal}>
              New Patient
            </button>
          </div>

          <div className="section-divider" />

          <div className="sidebar__section sidebar__section--grow">
            <div className="section-label">Department Summary</div>
            <div className="department-summary">
              {departmentSummary.map((department) => (
                <button
                  key={department.name}
                  className="department-summary__item"
                  type="button"
                  onClick={() => setSearch(department.name)}
                >
                  <span>{department.name}</span>
                  <strong>{department.queue}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="section-divider" />

          <div className="sidebar__section sidebar__footnote">
            <span>{dashboard?.aiMode === 'gemini' ? 'GEMINI LIVE' : 'DEMO HEURISTIC'}</span>
            <button
              className="sidebar-refresh"
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={loading || refreshing}
            >
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </aside>

        <main className="queue-panel">
          <div className="queue-panel__header">
            <div>
              <div className="section-label">Patient Priority Queue</div>
              <h1>Live Queue</h1>
            </div>
            <div className="queue-panel__tools">
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SEARCH PATIENT / COMPLAINT / DEPARTMENT"
              />
            </div>
          </div>

          <div className="section-divider" />

          {error ? <div className="system-notice">{error}</div> : null}

          <div className="queue-headings">
            <span>Priority</span>
            <span>Patient</span>
            <span>Chief Complaint</span>
            <span>Vitals</span>
            <span>Wait</span>
          </div>

          <div className="queue-list">
            {loading && !dashboard ? (
              <div className="queue-empty">LOADING QUEUE...</div>
            ) : null}

            {!loading && queue.length === 0 ? (
              <div className="queue-empty">NO PATIENTS MATCH THE CURRENT FILTER.</div>
            ) : null}

            {queue.map((patient) => {
              const band = getSeverityBand(patient)
              const selected = selectedPatient?.id === patient.id
              const pulsating = patient.id === topCriticalId && band === 'critical'

              return (
                <button
                  key={patient.id}
                  className={[
                    'queue-row',
                    `queue-row--${band}`,
                    selected ? 'queue-row--selected' : '',
                    pulsating ? 'queue-row--pulse' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  type="button"
                  onClick={() => handleSelectPatient(patient.id)}
                >
                  <div className="queue-row__priority">
                    <span className={`severity-pill severity-pill--${band}`}>
                      {severityLabel(band)}
                    </span>
                  </div>
                  <div className="queue-row__patient">
                    <strong>{patient.name}</strong>
                    <span>
                      {patient.age}/{abbreviateSex(patient.sex)} • {patient.id}
                    </span>
                  </div>
                  <div className="queue-row__complaint" title={patient.chiefComplaint}>
                    {patient.chiefComplaint}
                  </div>
                  <div className="queue-row__vitals">
                    <VitalChip
                      label="BP"
                      value={`${patient.vitals.systolic}/${patient.vitals.diastolic}`}
                      tone={vitalTone('bloodPressure', patient.vitals)}
                    />
                    <VitalChip
                      label="HR"
                      value={String(patient.vitals.heartRate)}
                      tone={vitalTone('heartRate', patient.vitals)}
                    />
                    <VitalChip
                      label="SpO₂"
                      value={`${patient.vitals.spo2}%`}
                      tone={vitalTone('spo2', patient.vitals)}
                    />
                    <VitalChip
                      label="Temp"
                      value={`${patient.vitals.temperature.toFixed(1)}`}
                      tone={vitalTone('temperature', patient.vitals)}
                    />
                  </div>
                  <div className="queue-row__wait">
                    <strong>{patient.estimatedWaitMinutes}m</strong>
                    <span>{formatRelative(patient.registeredAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </main>

        <aside className="detail-panel">
          {selectedPatient ? (
            <>
              <div className="patient-banner">
                <div>
                  <div className="section-label">Selected Patient</div>
                  <h2>{selectedPatient.name}</h2>
                  <p>{selectedPatient.chiefComplaint}</p>
                </div>
                <span className={`severity-pill severity-pill--${selectedBand}`}>
                  {severityLabel(selectedBand)}
                </span>
              </div>

              <div className="detail-section score-section">
                <div className="score-ring">
                  <ScoreRing score={selectedPatient.severityScore} band={selectedBand} />
                </div>
                <div className="score-bars">
                  {scoreBreakdown.map((entry) => (
                    <ScoreBar
                      key={entry.label}
                      label={entry.label}
                      value={entry.value}
                      band={selectedBand}
                    />
                  ))}
                </div>
              </div>

              <div className="detail-section">
                <div className="section-label">Realtime Vitals</div>
                <div className="vitals-grid">
                  <VitalCard
                    label="Blood Pressure"
                    value={`${selectedPatient.vitals.systolic}/${selectedPatient.vitals.diastolic}`}
                    unit="mmHg"
                    status={vitalStatus('bloodPressure', selectedPatient.vitals)}
                    tone={vitalTone('bloodPressure', selectedPatient.vitals)}
                  />
                  <VitalCard
                    label="Heart Rate"
                    value={String(selectedPatient.vitals.heartRate)}
                    unit="bpm"
                    status={vitalStatus('heartRate', selectedPatient.vitals)}
                    tone={vitalTone('heartRate', selectedPatient.vitals)}
                  />
                  <VitalCard
                    label="SpO₂"
                    value={String(selectedPatient.vitals.spo2)}
                    unit="%"
                    status={vitalStatus('spo2', selectedPatient.vitals)}
                    tone={vitalTone('spo2', selectedPatient.vitals)}
                  />
                  <VitalCard
                    label="Temperature"
                    value={selectedPatient.vitals.temperature.toFixed(1)}
                    unit="C"
                    status={vitalStatus('temperature', selectedPatient.vitals)}
                    tone={vitalTone('temperature', selectedPatient.vitals)}
                  />
                  <VitalCard
                    label="Respiratory Rate"
                    value={String(selectedPatient.vitals.respiratoryRate)}
                    unit="/min"
                    status={vitalStatus('respiratoryRate', selectedPatient.vitals)}
                    tone={vitalTone('respiratoryRate', selectedPatient.vitals)}
                  />
                  <VitalCard
                    label="Trend"
                    value={selectedPatient.trend.toUpperCase()}
                    unit=""
                    status={selectedPatient.queueStage}
                    tone={selectedBand}
                  />
                </div>
              </div>

              <div className="detail-section">
                <div className="section-label">Department Routing</div>
                <div className="routing-grid">
                  {(dashboard?.departments ?? []).slice(0, 6).map((department) => (
                    <RoutingChip
                      key={department.name}
                      department={department}
                      band={selectedBand}
                      recommended={department.name === selectedPatient.department.primary}
                    />
                  ))}
                </div>
              </div>

              <div className="detail-section chat-section">
                <div className="section-label">AI Clinical Chat</div>
                <div className="chat-thread">
                  {selectedChatMessages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                </div>
                <form className="chat-form" onSubmit={handleChatSubmit}>
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask for risk rationale, routing, or next action"
                  />
                  <button type="submit">Send</button>
                </form>
              </div>
            </>
          ) : (
            <div className="detail-empty">SELECT A PATIENT TO LOAD CLINICAL DETAIL.</div>
          )}
        </aside>
      </div>

      {isModalOpen ? (
        <div className="modal-overlay" role="presentation" onClick={handleCloseModal}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-patient-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="section-label">New Patient Intake</div>
                <h2 id="new-patient-title">Admit Patient</h2>
              </div>
              <button className="modal-close" type="button" onClick={handleCloseModal}>
                Close
              </button>
            </div>

            <form className="modal-form" onSubmit={handleAdmitPatient}>
              <label>
                <span>Patient Name</span>
                <input
                  value={form.name}
                  onChange={(event) => updateFormField('name', event.target.value)}
                  required
                />
              </label>

              <div className="modal-form__row">
                <label>
                  <span>Age</span>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={form.age}
                    onChange={(event) => updateFormField('age', event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Sex</span>
                  <select
                    value={form.sex}
                    onChange={(event) =>
                      updateFormField('sex', event.target.value as FormState['sex'])
                    }
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </label>
              </div>

              <div className="modal-form__row">
                <label>
                  <span>Arrival Mode</span>
                  <select
                    value={form.arrivalMode}
                    onChange={(event) =>
                      updateFormField('arrivalMode', event.target.value as ArrivalMode)
                    }
                  >
                    <option>Walk-in</option>
                    <option>Wheelchair</option>
                    <option>Ambulance</option>
                  </select>
                </label>
                <label>
                  <span>Priority Preview</span>
                  <div className={`priority-preview priority-preview--${modalBand}`}>
                    {severityLabel(modalBand)}
                  </div>
                </label>
              </div>

              <label>
                <span>Chief Complaint</span>
                <input
                  value={form.chiefComplaint}
                  onChange={(event) => updateFormField('chiefComplaint', event.target.value)}
                  required
                />
              </label>

              <div className="symptom-picker">
                <span>Symptoms</span>
                <div className="symptom-tags">
                  {symptomCatalog.map((symptom) => {
                    const active = form.symptoms.includes(symptom)

                    return (
                      <button
                        key={symptom}
                        className={[
                          'symptom-tag',
                          active ? `symptom-tag--active symptom-tag--${modalBand}` : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        type="button"
                        onClick={() => toggleSymptom(symptom)}
                      >
                        {symptom}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="modal-vitals">
                <CompactVitalInput
                  label="HR"
                  unit="bpm"
                  value={form.vitals.heartRate}
                  onChange={(value) => updateVital('heartRate', value)}
                />
                <CompactVitalInput
                  label="SpO₂"
                  unit="%"
                  value={form.vitals.spo2}
                  onChange={(value) => updateVital('spo2', value)}
                />
                <CompactVitalInput
                  label="SYS"
                  unit="mmHg"
                  value={form.vitals.systolic}
                  onChange={(value) => updateVital('systolic', value)}
                />
                <CompactVitalInput
                  label="DIA"
                  unit="mmHg"
                  value={form.vitals.diastolic}
                  onChange={(value) => updateVital('diastolic', value)}
                />
                <CompactVitalInput
                  label="TEMP"
                  unit="C"
                  value={form.vitals.temperature}
                  onChange={(value) => updateVital('temperature', value)}
                />
                <CompactVitalInput
                  label="RR"
                  unit="/min"
                  value={form.vitals.respiratoryRate}
                  onChange={(value) => updateVital('respiratoryRate', value)}
                />
              </div>

              {assessment ? (
                <div className={`assessment-preview assessment-preview--${modalBand}`}>
                  <strong>{assessment.patient.summary}</strong>
                  <span>{assessment.patient.department.primary}</span>
                  <p>{assessment.patient.triageReasoning}</p>
                </div>
              ) : null}

              <div className="modal-actions">
                <button
                  className="modal-button modal-button--assessment"
                  type="button"
                  onClick={() => void handleRunAssessment()}
                  disabled={assessing || form.symptoms.length === 0}
                >
                  {assessing ? 'Running AI Assessment' : 'Run AI Assessment'}
                </button>
                <button
                  className={`modal-button modal-button--admit modal-button--${modalBand}`}
                  type="submit"
                  disabled={submitting || !assessment}
                >
                  {submitting ? 'Admitting Patient' : 'Admit Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )

  function updateFormField<Key extends keyof FormState>(field: Key, value: FormState[Key]) {
    setAssessment(null)
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateVital(field: keyof PatientVitals, value: string) {
    setAssessment(null)
    setForm((current) => ({
      ...current,
      vitals: {
        ...current.vitals,
        [field]: value,
      },
    }))
  }

  function toggleSymptom(symptom: string) {
    setAssessment(null)
    setForm((current) => ({
      ...current,
      symptoms: current.symptoms.includes(symptom)
        ? current.symptoms.filter((entry) => entry !== symptom)
        : [...current.symptoms, symptom],
    }))
  }

  function handleOpenModal() {
    setIsModalOpen(true)
    setError(null)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
    setAssessment(null)
  }

  async function handleRunAssessment() {
    setAssessing(true)
    setError(null)

    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(form)),
      })

      if (!response.ok) {
        const details = await response.json().catch(() => null)
        throw new Error(details?.message ?? 'AI assessment failed.')
      }

      const result = (await response.json()) as AssessmentResponse
      setAssessment(result)
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'AI assessment failed.',
      )
    } finally {
      setAssessing(false)
    }
  }

  async function handleAdmitPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(form)),
      })

      if (!response.ok) {
        const details = await response.json().catch(() => null)
        throw new Error(details?.message ?? 'Patient admission failed.')
      }

      const result = (await response.json()) as TriageResponse

      startTransition(() => {
        setLatestTriage(result)
        setDashboard(result.dashboard)
        setSelectedPatientId(result.patient.id)
        setSearch('')
        setAssessment(null)
        setIsModalOpen(false)
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Patient admission failed.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleManualRefresh() {
    setLoading(true)
    setError(null)

    try {
      const payload = await requestDashboard()
      setDashboard(payload)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Command hub sync failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!chatInput.trim() || !selectedPatient) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: chatInput.trim(),
    }

    const aiReply: ChatMessage = {
      id: `ai-${Date.now() + 1}`,
      role: 'ai',
      text: generateChatReply(chatInput.trim(), selectedPatient),
    }

    setChatHistoryByPatient((current) => ({
      ...current,
      [selectedPatient.id]: [...selectedChatMessages, userMessage, aiReply],
    }))
    setChatInput('')
  }

  function handleSelectPatient(patientId: string) {
    setSelectedPatientId(patientId)
  }
}

export default App

function TopStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone: 'critical' | 'urgent' | 'stable' | 'neutral'
}) {
  return (
    <div className="top-stat">
      <strong className={`top-stat__value top-stat__value--${tone}`}>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function ScoreRing({
  score,
  band,
}: {
  score: number
  band: SeverityBand
}) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <svg viewBox="0 0 96 96" className="score-ring__svg" aria-hidden="true">
      <circle cx="48" cy="48" r={radius} className="score-ring__track" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        className={`score-ring__fill score-ring__fill--${band}`}
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: offset,
        }}
      />
      <text x="48" y="48" textAnchor="middle" dominantBaseline="central">
        {score}
      </text>
    </svg>
  )
}

function ScoreBar({
  label,
  value,
  band,
}: {
  label: string
  value: number
  band: SeverityBand
}) {
  return (
    <div className="score-bar">
      <span className="score-bar__label">{label}</span>
      <div className="score-bar__track">
        <div
          className={`score-bar__fill score-bar__fill--${band}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function VitalChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: SeverityBand | 'default'
}) {
  return (
    <span className={`vital-chip vital-chip--${tone}`}>
      {label} {value}
    </span>
  )
}

function VitalCard({
  label,
  value,
  unit,
  status,
  tone,
}: {
  label: string
  value: string
  unit: string
  status: string
  tone: SeverityBand | 'default'
}) {
  return (
    <article className={`vital-card vital-card--${tone}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <p>{status}</p>
    </article>
  )
}

function RoutingChip({
  department,
  band,
  recommended,
}: {
  department: DepartmentLoad
  band: SeverityBand
  recommended: boolean
}) {
  const loadTone = department.occupancy >= 85 ? 'critical' : department.occupancy >= 70 ? 'urgent' : 'stable'

  return (
    <article
      className={[
        'routing-chip',
        recommended ? `routing-chip--recommended routing-chip--${band}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {recommended ? <span className="routing-chip__label">AI recommended</span> : null}
      <strong title={department.name}>{department.name}</strong>
      <div className="routing-chip__bar">
        <div className={`routing-chip__fill routing-chip__fill--${loadTone}`} style={{ width: `${department.occupancy}%` }} />
      </div>
      <span>{department.occupancy}% load</span>
    </article>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`chat-bubble chat-bubble--${message.role}`}>
      {message.role === 'ai' ? <span>GEMINI AI</span> : null}
      <p>{message.text}</p>
    </article>
  )
}

function CompactVitalInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="compact-vital">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required />
      <small>{unit}</small>
    </label>
  )
}

function buildPayload(form: FormState) {
  return {
    name: form.name.trim(),
    age: Number(form.age),
    sex: form.sex,
    arrivalMode: form.arrivalMode,
    chiefComplaint: form.chiefComplaint.trim(),
    symptoms: form.symptoms,
    vitals: {
      heartRate: Number(form.vitals.heartRate),
      spo2: Number(form.vitals.spo2),
      systolic: Number(form.vitals.systolic),
      diastolic: Number(form.vitals.diastolic),
      temperature: Number(form.vitals.temperature),
      respiratoryRate: Number(form.vitals.respiratoryRate),
    },
  }
}

function severityLabel(band: SeverityBand) {
  switch (band) {
    case 'critical':
      return 'P1 CRITICAL'
    case 'urgent':
      return 'P2 URGENT'
    case 'stable':
      return 'P3 STABLE'
  }
}

function getSeverityBand(patient: PatientQueueItem): SeverityBand {
  if (patient.priorityLevel === 'Critical' || patient.severityScore >= 85) {
    return 'critical'
  }

  if (patient.priorityLevel === 'Low' || patient.severityScore < 35) {
    return 'stable'
  }

  return 'urgent'
}

function sortQueue(queue: PatientQueueItem[], searchTerm: string) {
  const normalized = searchTerm.trim().toLowerCase()

  return [...queue]
    .filter((patient) => {
      if (!normalized) {
        return true
      }

      return [
        patient.id,
        patient.name,
        patient.chiefComplaint,
        patient.department.primary,
        patient.priorityLevel,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
    .sort((left, right) => {
      const rankDelta = severityRank(getSeverityBand(left)) - severityRank(getSeverityBand(right))

      if (rankDelta !== 0) {
        return rankDelta
      }

      if (left.estimatedWaitMinutes !== right.estimatedWaitMinutes) {
        return left.estimatedWaitMinutes - right.estimatedWaitMinutes
      }

      return new Date(left.registeredAt).getTime() - new Date(right.registeredAt).getTime()
    })
}

function severityRank(band: SeverityBand) {
  switch (band) {
    case 'critical':
      return 0
    case 'urgent':
      return 1
    case 'stable':
      return 2
  }
}

function buildScoreBreakdown(patient: PatientQueueItem) {
  return [
    {
      label: 'Vitals Severity',
      value: scoreVitals(patient.vitals),
    },
    {
      label: 'Symptom Risk',
      value: scoreSymptoms(patient.symptoms, patient.chiefComplaint),
    },
    {
      label: 'Age Factor',
      value: Math.min(100, Math.round((patient.age / 90) * 100)),
    },
    {
      label: 'Wait Penalty',
      value: Math.min(100, patient.estimatedWaitMinutes * 3),
    },
  ]
}

function scoreVitals(vitals: PatientVitals) {
  let score = 18

  if (vitals.spo2 <= 90) {
    score += 34
  } else if (vitals.spo2 <= 94) {
    score += 18
  }

  if (vitals.heartRate >= 125 || vitals.heartRate <= 45) {
    score += 18
  } else if (vitals.heartRate >= 110) {
    score += 10
  }

  if (vitals.systolic <= 95 || vitals.systolic >= 170) {
    score += 18
  }

  if (vitals.temperature >= 39) {
    score += 12
  }

  if (vitals.respiratoryRate >= 28) {
    score += 18
  } else if (vitals.respiratoryRate >= 22) {
    score += 10
  }

  return Math.min(100, score)
}

function scoreSymptoms(symptoms: string[], complaint: string) {
  const keywords = `${complaint} ${symptoms.join(' ')}`.toLowerCase()
  let score = 16

  const weights = [
    ['chest', 24],
    ['breath', 22],
    ['stroke', 28],
    ['slurred', 26],
    ['bleeding', 24],
    ['seizure', 28],
    ['vomiting', 10],
    ['fever', 8],
    ['trauma', 14],
  ] as const

  for (const [term, weight] of weights) {
    if (keywords.includes(term)) {
      score += weight
    }
  }

  return Math.min(100, score)
}

function vitalTone(
  vital:
    | 'bloodPressure'
    | 'heartRate'
    | 'spo2'
    | 'temperature'
    | 'respiratoryRate',
  vitals: PatientVitals,
): SeverityBand | 'default' {
  switch (vital) {
    case 'bloodPressure':
      if (vitals.systolic <= 90 || vitals.systolic >= 175) {
        return 'critical'
      }
      if (vitals.systolic <= 100 || vitals.systolic >= 160) {
        return 'urgent'
      }
      return 'default'
    case 'heartRate':
      if (vitals.heartRate >= 130 || vitals.heartRate <= 45) {
        return 'critical'
      }
      if (vitals.heartRate >= 110) {
        return 'urgent'
      }
      return 'default'
    case 'spo2':
      if (vitals.spo2 <= 90) {
        return 'critical'
      }
      if (vitals.spo2 <= 94) {
        return 'urgent'
      }
      return 'default'
    case 'temperature':
      if (vitals.temperature >= 39.5) {
        return 'critical'
      }
      if (vitals.temperature >= 38) {
        return 'urgent'
      }
      return 'default'
    case 'respiratoryRate':
      if (vitals.respiratoryRate >= 30) {
        return 'critical'
      }
      if (vitals.respiratoryRate >= 22) {
        return 'urgent'
      }
      return 'default'
  }
}

function vitalStatus(
  vital:
    | 'bloodPressure'
    | 'heartRate'
    | 'spo2'
    | 'temperature'
    | 'respiratoryRate',
  vitals: PatientVitals,
) {
  const tone = vitalTone(vital, vitals)

  if (tone === 'critical') {
    return 'CRITICAL VALUE'
  }

  if (tone === 'urgent') {
    return 'WARNING RANGE'
  }

  return 'WITHIN RANGE'
}

function estimateFormBand(form: FormState): SeverityBand {
  const payload = buildPayload(form)
  const pseudoPatient: PatientQueueItem = {
    id: 'preview',
    name: payload.name,
    age: payload.age,
    sex: payload.sex,
    chiefComplaint: payload.chiefComplaint,
    symptoms: payload.symptoms,
    arrivalMode: payload.arrivalMode,
    severityScore:
      scoreVitals(payload.vitals) * 0.5 +
      scoreSymptoms(payload.symptoms, payload.chiefComplaint) * 0.3 +
      Math.min(100, Math.round((payload.age / 90) * 100)) * 0.2,
    priorityLevel: 'Moderate',
    queueStage: 'Physician review',
    estimatedWaitMinutes: 10,
    department: { primary: 'General Medicine', secondary: 'Emergency Medicine' },
    alerts: [],
    summary: '',
    triageReasoning: '',
    recommendedActions: [],
    vitals: payload.vitals,
    trend: 'Stable',
    registeredAt: new Date().toISOString(),
  }

  return getSeverityBand(pseudoPatient)
}

function buildInitialChat(
  patient: PatientQueueItem,
  latestTriage: TriageResponse | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      id: `ai-${patient.id}-summary`,
      role: 'ai',
      text: `${patient.summary} Route ${patient.department.primary}. ${patient.recommendedActions[0] ?? 'Continue monitored observation.'}`,
    },
  ]

  if (latestTriage?.patient.id === patient.id) {
    messages.push({
      id: `ai-${patient.id}-handoff`,
      role: 'ai',
      text: latestTriage.clinicianHandoff,
    })
  }

  return messages
}

function generateChatReply(question: string, patient: PatientQueueItem) {
  const normalized = question.toLowerCase()

  if (normalized.includes('why') || normalized.includes('reason')) {
    return patient.triageReasoning
  }

  if (normalized.includes('route') || normalized.includes('department')) {
    return `Primary routing is ${patient.department.primary}. Secondary support remains ${patient.department.secondary}.`
  }

  if (normalized.includes('next') || normalized.includes('action')) {
    return patient.recommendedActions.join('. ')
  }

  if (normalized.includes('risk') || normalized.includes('score')) {
    return `Current triage score is ${patient.severityScore}/100 with ${severityLabel(getSeverityBand(patient))}. The leading risk drivers are symptom profile, live vitals, and wait penalty.`
  }

  return `Maintain ${patient.queueStage.toLowerCase()} for ${patient.name}. Monitor ${patient.department.primary} readiness and repeat vital review on the next 5-second sync.`
}

function abbreviateSex(sex: string) {
  if (sex === 'Male') {
    return 'M'
  }

  if (sex === 'Female') {
    return 'F'
  }

  return 'O'
}

function formatRelative(isoString: string) {
  const differenceMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(isoString).getTime()) / 60_000),
  )

  if (differenceMinutes < 1) {
    return 'JUST NOW'
  }

  return `${differenceMinutes}M AGO`
}

async function requestDashboard() {
  const response = await fetch('/api/dashboard')

  if (!response.ok) {
    throw new Error('Unable to load the command hub feed.')
  }

  return (await response.json()) as DashboardSnapshot
}
