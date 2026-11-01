export type Mode = 'C' | 'A'
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
  stats: null | {
    verdict: Status
    reason: string
    explained_share: number
    top_segment: string
    driver_delta: number
    total_baseline: number
    total_incident: number
    total_delta: number
    base_share: number
    lift: number | null
    possible_relabel: boolean
    top_movers: { segment: string; baseline: number; incident: number; delta: number }[]
  }
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
}

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

export interface CompareRow { mode: Mode; root_cause: string; exposure: Exposure; seconds: number; problem: string }

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
  investigate: (body: { dataset: string; problem: string; mode: Mode; model: string }) =>
    req<{ id: string }>('/api/investigations', json(body)),
  investigation: (id: string) => req<Investigation>(`/api/investigations/${id}`),
  compare: (ds: string) => req<CompareRow[]>(`/api/compare/${ds}`),
  architecture: (ds: string) => req<Architecture>(`/api/architecture/${ds}`),
}
