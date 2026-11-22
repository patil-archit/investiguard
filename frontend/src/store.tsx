import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type AskAnswer, type Dataset, type IgEvent, type Investigation, type Mode } from './api'

export interface RunState {
  id: string
  problem: string
  events: IgEvent[]
  status: 'running' | 'done' | 'error'
  investigation: Investigation | null
  error: string | null
}

interface Store {
  datasets: Dataset[]
  dataset: Dataset | null
  setDataset: (name: string) => void
  reloadDatasets: (select?: string) => Promise<void>
  mode: Mode
  setMode: (m: Mode) => void
  model: string
  setModel: (m: string) => void
  approvals: boolean                             // ask before an evidence-gate / budget denial is final
  setApprovals: (v: boolean) => void
  draftProblem: string | null                    // a problem chosen elsewhere (e.g. the answer key) for Investigate
  setDraftProblem: (p: string | null) => void
  allowTables: string[]                          // System B: tables the analyst allows up front
  setAllowTables: (t: string[]) => void
  runs: Record<string, RunState>                 // key: `${dataset}:${mode}`
  startRun: (problem: string) => Promise<void>
  asks: Record<string, AskAnswer[]>              // key: dataset
  addAsk: (a: AskAnswer) => void
  loadError: string | null
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('store missing')
  return s
}

const saved = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [current, setCurrent] = useState(saved('ig.dataset', ''))
  const [mode, setModeState] = useState<Mode>(saved('ig.mode', 'C') as Mode)
  const [model, setModelState] = useState(saved('ig.model', ''))
  const [approvals, setApprovalsState] = useState(saved('ig.approvals', '0') === '1')
  const [allowTables, setAllowTables] = useState<string[]>([])
  const [draftProblem, setDraftProblem] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [asks, setAsks] = useState<Record<string, AskAnswer[]>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const sources = useRef<Record<string, EventSource>>({})

  const reloadDatasets = useCallback(async (select?: string) => {
    try {
      const list = await api.datasets()
      setDatasets(list)
      setLoadError(null)
      setCurrent(cur => {
        const next = select ?? (list.some(d => d.name === cur) ? cur : list[0]?.name ?? '')
        save('ig.dataset', next)
        return next
      })
    } catch (e) {
      setLoadError(`Cannot reach the API (${(e as Error).message}). Start it with: .venv/bin/uvicorn server.api:app --port 8765`)
    }
  }, [])

  useEffect(() => {
    reloadDatasets()
    api.config().then(c => setModelState(m => m || c.model)).catch(() => undefined)
  }, [reloadDatasets])

  const dataset = datasets.find(d => d.name === current) ?? null

  const startRun = useCallback(async (problem: string) => {
    if (!dataset) return
    const key = `${dataset.name}:${mode}`
    sources.current[key]?.close()
    const { id } = await api.investigate({ dataset: dataset.name, problem, mode, model, approvals, allow_tables: allowTables })
    setRuns(r => ({ ...r, [key]: { id, problem, events: [], status: 'running', investigation: null, error: null } }))
    const es = new EventSource(`/api/investigations/${id}/events`)
    sources.current[key] = es
    es.onmessage = msg => {
      const ev = JSON.parse(msg.data) as IgEvent
      setRuns(r => (r[key]?.id === id ? { ...r, [key]: { ...r[key], events: [...r[key].events, ev] } } : r))
    }
    es.addEventListener('end', async () => {
      es.close()
      const inv = await api.investigation(id)
      setRuns(r => (r[key]?.id === id
        ? { ...r, [key]: { ...r[key], status: inv.status === 'error' ? 'error' : 'done', investigation: inv, error: inv.error } }
        : r))
    })
    es.onerror = () => { /* the browser retries automatically; 'end' closes it */ }
  }, [dataset, mode, model, approvals, allowTables])

  const value = useMemo<Store>(() => ({
    datasets, dataset, loadError,
    setDataset: n => { setCurrent(n); save('ig.dataset', n) },
    reloadDatasets,
    mode, setMode: m => { setModeState(m); save('ig.mode', m) },
    model, setModel: m => { setModelState(m); save('ig.model', m) },
    approvals, setApprovals: v => { setApprovalsState(v); save('ig.approvals', v ? '1' : '0') },
    allowTables, setAllowTables, draftProblem, setDraftProblem,
    runs, startRun,
    asks, addAsk: a => dataset && setAsks(s => ({ ...s, [dataset.name]: [a, ...(s[dataset.name] ?? [])] })),
  }), [datasets, dataset, loadError, reloadDatasets, mode, model, approvals, allowTables, draftProblem, runs, startRun, asks])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
