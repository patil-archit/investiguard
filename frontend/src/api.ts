/** C = InvestiGuard (hypothesis-driven, scoped). A = Direct AI baseline (no hypotheses, every column open). */
export type Mode = 'C' | 'B' | 'A'
export const MODE_LABEL: Record<string, string> = {
  C: 'InvestiGuard', B: 'Static sandbox', A: 'Direct AI',
  'C-gate': 'InvestiGuard − evidence gate', 'C-table': 'InvestiGuard − column scope', 'C-order': 'InvestiGuard − privilege order',
}
export const MODE_PLAIN: Record<Mode, string> = {
  C: 'Tests one guess at a time. Each guess gets a short-lived key for only the columns it needs. Code judges the evidence.',
  B: 'An analyst picks a few tables up front. The AI can read everything in them for the whole run, and judges itself.',
  A: 'The AI gets the whole database for the whole run, writes any query it likes, and judges itself. No checks.',
}
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
  incidents?: number
  generated?: { rows: number; tables: Record<string, [number, number]>; seconds: number; scale: number } | null
}

export interface Incident {
  id: string; title: string; month: string; metric: string; cause: string; signature: string; problem: string
  change: number; baseline_value: number; incident_value: number; required: string[]; keywords: string[][]
}
export interface AnswerKey { incidents: Incident[]; decoys: string[]; generated: Dataset['generated'] }
export interface AnswerCheck { incident: string; title: string; cause: string; found: boolean; missing: string[]; required: string[] }

export interface ColumnQuality {
  column: string; type: string; sensitivity: string; null_pct: number; distinct: number; unique_ratio: number; numeric: boolean
  outlier_pct?: number; min?: number | string; max?: number | string; mean?: number; hist?: number[]; top?: { value: string; share: number }[]
}
export interface TableQuality {
  table: string; rows: number; columns: number; sampled: number; exact: boolean; key_candidates: string[]; duplicate_rows: number
  issues: { column: string; kind: string; detail: string }[]; score: number; columns_detail: ColumnQuality[]
}
export interface QualityReport { tables: TableQuality[]; rows: number; columns: number; score: number; seconds: number }
export interface PiiFinding { resource: string; detector: string; match_rate: number; current: string; suggested: string; under_labelled: boolean; example: string; free_text: boolean }
export interface PiiScan { findings: PiiFinding[]; injections: { resource: string; cells: number; scanned: number }[]; under_labelled: number }
export interface SchemaMap {
  tables: Record<string, { rows: number; columns: number; sensitive: number; gate: string | string[] | null }>
  edges: { from: string; to: string; column: string; coverage: number | null; kind: string }[]
}
export interface IngestReport {
  dataset: string; seconds?: number; note?: string
  tables: { table: string; source: string; rows: number; columns: number; duplicates: number | null; indexed: string[]; bytes: number
    actions: { action: string; columns?: string[]; pairs?: string[][]; count?: number }[] }[]
}
export interface Job { id: string; kind: string; status: 'running' | 'done' | 'error'; message: string; progress: number; result: any; error: string | null; seconds?: number }

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
  evidence_score?: number
  score_parts?: { E: number; S: number; T: number }
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
  gateway_p95_ms?: number | null
  policy_p50_ms?: number | null
  policy_p95_ms?: number | null
  overhead_p50_ms?: number | null
  overhead_p95_ms?: number | null
  overhead_total_ms?: number
  policy_decisions?: number
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

export interface Receipt { run_id: string; entries: number; root_hash: string; algorithm: string; sealed_at: number; signature: string; key_id?: string }
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
  caveat?: string
  claims_proposed?: number
  evidence_faithfulness?: number
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
  answer_check?: AnswerCheck | null
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
  scenario: string; title: string; mode: string; truth: string; error: string | null; root_cause: string
  synopsis_id?: string; permission_precision?: number; permission_recall?: number; granted_columns?: number
  overhead_ms?: number | null; overhead_share?: number | null
  correct: boolean; mechanism_correct?: boolean; trapped?: boolean; injection_obeyed?: boolean
  columns_touched: number; columns_total: number; exposure: number; sensitive_raw: string[]
  injections_blocked: number; queries_denied: number; column_seconds: number; sensitive_column_seconds: number
  seconds: number; llm_calls: number
}
export interface BenchSummary {
  runs: number; errors?: number; accuracy: number; mechanism_accuracy: number | null; trapped: number; injections_obeyed: number
  avg_exposure: number; sensitive_raw_columns: number; avg_column_seconds: number; avg_seconds: number; avg_llm_calls: number
  permission_precision?: number; permission_recall?: number; overhead_share?: number
  accuracy_ci?: [number, number] | null; exposure_ci?: [number, number] | null
}
export interface BenchTests { pairs: number; mcnemar_p: number; only_C_correct: number; only_A_correct: number; wilcoxon_exposure_p: number | null; note: string }
export interface Benchmark {
  state: { status: 'idle' | 'running'; progress: { done: number; total: number; scenario: string; mode: string } | null; error: string | null }
  results: { model: string; finished_at: number; rows: BenchRow[]; summary: Record<string, BenchSummary> & { tests?: BenchTests } } | null
  shopsim?: { model: string; finished_at: number; found: number; total: number; rows: ShopSimRow[] } | null
}
export interface ShopSimRow {
  id: string; title: string; month: string; change: number; error: string | null; root_cause: string; found: boolean; missing: string[]
  columns_read: number; columns_total: number; sensitive_raw: string[]; injections_blocked: number
  permission_recall: number | null; permission_precision: number | null; column_seconds: number; seconds: number; llm_calls: number
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
  investigate: (body: { dataset: string; problem: string; mode: Mode; model: string; approvals: boolean; allow_tables?: string[] }) =>
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
  threats: () => req<ThreatCatalogue>('/api/threats'),
  answers: (ds: string) => req<AnswerKey>(`/api/datasets/${ds}/answers`),
  quality: (ds: string) => req<QualityReport>(`/api/datasets/${ds}/quality`),
  pii: (ds: string) => req<PiiScan>(`/api/datasets/${ds}/pii`),
  piiApply: (ds: string, resources: string[]) => req<{ changed: string[] }>(`/api/datasets/${ds}/pii/apply`, json({ resources })),
  schema: (ds: string) => req<SchemaMap>(`/api/datasets/${ds}/schema`),
  ingestReport: (ds: string) => req<IngestReport>(`/api/datasets/${ds}/ingest-report`),
  job: (id: string) => req<Job>(`/api/jobs/${id}`),
  shopsim: (scale: number) => req<{ job: string }>(`/api/datasets/shopsim?scale=${scale}`, { method: 'POST' }),
  /** Streamed upload with byte progress (XHR, since fetch has no upload progress). */
  uploadStream: (form: FormData, onProgress: (frac: number) => void) => new Promise<{ job: string }>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', '/api/datasets/upload-stream')
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total)
    x.onload = () => {
      let body: any = null
      try { body = JSON.parse(x.responseText) } catch { /* not JSON */ }
      if (x.status >= 200 && x.status < 300) resolve(body)
      else reject(new Error(body?.detail ?? `${x.status} ${x.statusText}`))
    }
    x.onerror = () => reject(new Error('upload failed: network error'))
    x.send(form)
  }),
  security: () => req<SecurityStatus>('/api/security'),
  systemRefresh: () => req<SystemStatus>('/api/system?refresh=true'),
}

export interface ThreatCase { id: string; cls: string; title: string; plain: string; attack: string; expect: string }
export interface ThreatResult { id: string; cls: string; outcome: 'blocked' | 'allowed' | 'skipped' | 'error'; layer: string; detail: string; passed: boolean; ms: number }
export interface ThreatSummary {
  attacks: number; tested: number; blocked: number; skipped: number; block_rate: number | null; legit: number; false_denials: number
  by_class: Record<string, { blocked: number; skipped: number; total: number }>
}
export interface ThreatCatalogue {
  classes: Record<string, { name: string; plain: string; expected: string; cases: number }>
  cases: ThreatCase[]
  last: { results: ThreatResult[]; summary: ThreatSummary | null; finished_at: number | null; sandbox: { available: boolean; reason: string } | null }
}
export interface SecurityStatus {
  controls: { layer: string; name: string; plain: string; detail: string; stat: number | null }[]
  stats: Record<string, number>
  signing_key: { key_id: string; source: string }
  sandbox: { available: boolean; reason: string }
}
