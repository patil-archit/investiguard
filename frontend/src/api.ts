/** C = InvestiGuard (hypothesis-driven, scoped). A = Direct AI baseline (no hypotheses, every column open). */
export type Mode = 'C' | 'A'
export const MODE_LABEL: Record<Mode, string> = { C: 'InvestiGuard', A: 'Direct AI' }
export type Status = 'PROPOSED' | 'TESTING' | 'SUPPORTED' | 'REJECTED' | 'INCONCLUSIVE' | 'BLOCKED'

export interface Dataset {
  name: string
  label: string
  currency: string
  problem: string
  suggested_problems: string[]
  sample_questions: string[]
  source: string
  ready: boolean
  tables?: number
  columns?: number
  sensitive?: number
}

export interface Hypothesis {
  id: string
  statement: string
  driver: string
  kind?: string
  resources: string[]
  plausibility: number
  info_gain: number
  privilege_cost: number
  priority: number
  status: Status
  parent: string | null
  blocked_reason: string | null
  finding: string | null
  explained_share: number
  confidence?: number | null
  focus?: string
  auto?: boolean
}

export interface IgEvent {
  t: number
  kind: string
  [key: string]: any
}

export interface Exposure {
  columns_touched: string[]
  columns_total: number
  data_exposure_ratio: number
  sensitive_exposed_raw: string[]
  queries_allowed: number
  queries_denied: number
  gateway_p50_ms: number | null
  capabilities_issued: number
  injections_blocked?: number
}

/** Columns open to the agent over the run; column_seconds is the area under the curve. */
export interface Privilege {
  column_seconds: number
  sensitive_column_seconds: number
  peak_columns: number
  duration_s?: number
  curve: { t: number; columns: number; sensitive: number }[]
  grants: { hypothesis: string; start: number; end: number; columns: number }[]
}

export interface Receipt { run_id: string; entries: number; root_hash: string; algorithm: string; sealed_at: number; signature: string }
export interface LedgerView {
  receipt: Receipt
  verification: { valid: boolean; checks: Record<string, boolean>; recomputed_root: string }
  tampered: boolean
  entries: { i: number; t: number; kind: string; hypothesis: string | null; hash: string }[]
}

export interface Report {
  root_cause: string
  plain_summary: string
  summary: string
  claims: { text: string; evidence_ids: string[] }[]
  limitations: string
  key_facts: string[]
  unsupported_claims_dropped: number
  done_reason: string | null
  not_investigation?: boolean
  unverified?: boolean
  exposure: Exposure
}

export interface EvidenceNode {
  id: string
  hypothesis: string
  cap_id: string
  sql: string
  columns: string[]
  rows: number
  verdict: Status
  explained_share: number
  finding: string
  stats: null | EvidenceStats
}

export interface EvidenceStats {
  kind?: 'decomposition' | 'price_volume' | 'timeline'
  verdict: Status
  reason: string
  explained_share: number
  top_segment: string
  // decomposition
  driver_delta: number
  total_baseline: number
  total_incident: number
  total_delta: number
  base_share: number
  lift: number | null
  significance_z?: number | null
  confidence?: number
  possible_relabel: boolean
  top_movers: { segment: string; baseline: number; incident: number; delta: number }[]
  // price vs volume
  main_effect?: 'price' | 'volume'
  volume_effect?: number
  price_effect?: number
  volume_share?: number
  price_share?: number
  qty_change_pct?: number
  price_change_pct?: number
  // timeline
  onset_period?: string
  before_mean?: number
  after_mean?: number
  step_strength?: number
  specific_to_segment?: boolean
  series?: { period: string; segment: number; rest: number }[]
}

export interface GatewayRecord {
  hypothesis_id: string
  sql: string
  verdict: 'allowed' | 'denied' | 'error'
  reason: string
  columns_used: string[]
  rows: number
  latency_ms: number
}

export interface InvestigationResult {
  report: Report
  hypotheses: Record<string, Hypothesis>
  evidence: EvidenceNode[]
  gateway_log: GatewayRecord[]
  steps?: DirectStep[]
  privilege?: Privilege
  receipt?: Receipt
  firewall?: { column: string; pattern: string; snippet: string; hypothesis: string }[]
}

/** One free-form query in a Direct AI run (no hypothesis, no verdict). */
export interface DirectStep {
  id: string
  thought: string
  sql: string
  error: string | null
  rows: number
  columns: string[]
  preview?: Record<string, any>[]
}

export interface Investigation {
  id: string
  dataset: string
  mode: Mode
  problem: string
  status: 'running' | 'done' | 'error'
  result: InvestigationResult | null
  error: string | null
  seconds: number | null
}

export interface AskAnswer {
  question: string
  answer: string
  sql: string
  denied: string | null
  seconds: number
  columns: string[]
  rows: Record<string, any>[]
  total_rows: number
  chart: 'bar' | 'line' | 'none'
  x: string
  y: string
  granted: Record<string, string>
  attempts: { attempt: number; sql: string; result: string; declared?: string[] }[]
  analysis?: { code: string; ok: boolean; error: string; seconds: number; isolation: string } | null
  injections_blocked?: { column: string; pattern: string; snippet: string }[]
}

export interface BenchRow {
  scenario: string; title: string; mode: Mode; truth: string; error: string | null; root_cause: string
  correct: boolean; mechanism_correct?: boolean; trapped?: boolean; injection_obeyed?: boolean
  columns_touched: number; columns_total: number; exposure: number; sensitive_raw: string[]
  injections_blocked: number; queries_denied: number; column_seconds: number; sensitive_column_seconds: number
  seconds: number; llm_calls: number
}
export interface BenchSummary {
  runs: number; errors?: number; accuracy: number; mechanism_accuracy: number | null; trapped: number; injections_obeyed: number
  avg_exposure: number; sensitive_raw_columns: number; avg_column_seconds: number; avg_seconds: number; avg_llm_calls: number
}
export interface Benchmark {
  state: { status: 'idle' | 'running'; progress: { done: number; total: number; scenario: string; mode: Mode } | null; error: string | null }
  results: { model: string; finished_at: number; rows: BenchRow[]; summary: Record<string, BenchSummary> } | null
}
export interface SystemStatus { sandbox: { available: boolean; reason: string }; sandbox_image: string }

export interface ColumnMeta { type?: string; sensitivity: string; description?: string }
export interface CatalogRaw {
  tables: Record<string, { description?: string; requires_finding: string | string[] | null; columns: Record<string, ColumnMeta> }>
}

export interface Architecture {
  orchestration: string
  nodes: { node: string; who: string; reads: string; produces: string; guards: string }[]
  state: { field: string; holds: string }[]
  threats: { threat: string; stopped_by: string; status: string }[]
  policy: { rule: string; name: string; enforces: string }[]
  evidence: { condition: string; verdict: string }[]
  stop: { share: number; iterations: number }
}

export interface CompareRow { mode: Mode; root_cause: string; exposure: Exposure; privilege?: Privilege | null; verified: boolean; seconds: number; problem: string }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { const body = await res.json(); msg = body.detail ?? msg } catch { /* not JSON */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export const api = {
  config: () => req<{ model: string; formats: string[] }>('/api/config'),
  datasets: () => req<Dataset[]>('/api/datasets'),
  catalog: (ds: string) => req<CatalogRaw>(`/api/datasets/${ds}/catalog`),
  saveCatalog: (ds: string, cat: CatalogRaw) =>
    req<{ ok: boolean }>(`/api/datasets/${ds}/catalog`, { ...json(cat), method: 'PUT' }),
  deleteDataset: (ds: string) => req<{ ok: boolean }>(`/api/datasets/${ds}`, { method: 'DELETE' }),
  refresh: (ds: string, model: string) =>
    req<{ ok: boolean }>(`/api/datasets/${ds}/refresh?model=${encodeURIComponent(model)}`, { method: 'POST' }),
  upload: (form: FormData) => req<{ dataset: string; tables: Record<string, { rows: number; columns: number }> }>(
    '/api/datasets/upload', { method: 'POST', body: form }),
  connect: (body: { name: string; label: string; url: string; currency: string; describe: boolean; model: string }) =>
    req<{ dataset: string; tables: number }>('/api/datasets/connect', json(body)),
  ask: (body: { dataset: string; question: string; mode: Mode; model: string }) => req<AskAnswer>('/api/ask', json(body)),
  investigate: (body: { dataset: string; problem: string; mode: Mode; model: string; approvals: boolean }) =>
    req<{ id: string }>('/api/investigations', json(body)),
  approve: (id: string, hypothesis: string, approve: boolean) =>
    req<{ ok: boolean }>(`/api/investigations/${id}/approvals`, json({ hypothesis, approve })),
  ledger: (id: string, tamper = false) => req<LedgerView>(`/api/investigations/${id}/ledger?tamper=${tamper}`),
  system: () => req<SystemStatus>('/api/system'),
  benchmark: () => req<Benchmark>('/api/benchmark'),
  runBenchmark: (model: string) => req<{ ok: boolean }>('/api/benchmark/run', json({ model })),
  investigation: (id: string) => req<Investigation>(`/api/investigations/${id}`),
  compare: (ds: string) => req<CompareRow[]>(`/api/compare/${ds}`),
  architecture: (ds: string) => req<Architecture>(`/api/architecture/${ds}`),
}
