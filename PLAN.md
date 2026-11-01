# InvestiGuard — MVP, Architecture & LangGraph Orchestration Plan

Source: TEAM20 synopsis (IS353IA, submitted 03/10/2026). Today is week ~5 (Phase III, design).
Synopsis milestone to hit: **working prototype / baseline agent by week 9 (~28 Nov 2026)**.

---

## 1. MVP definition

### 1.1 One-line goal
Given *"Revenue fell X% in month M — find the root cause"*, the agent tests hypotheses one at a
time, holding only column-level, time-boxed, read-only capabilities that a deterministic policy
engine grants, and produces a report where every claim links to evidence and to the exact columns
touched — and it can be run side by side with an unrestricted baseline to show the exposure gap.

### 1.2 What the MVP must demonstrate (the demo script)
1. User types the S1 problem in the Agent Studio.
2. Hypotheses appear (traffic drop, regional outage, stock-out, payment failure…), ordered
   cheapest-privilege-first.
3. Agent requests `deployment_logs` early → **DENIED (P4 evidence gate)**, shown in red.
4. Agent tests payments → anomaly SUPPORTED → re-requests `deployment_logs` → **ALLOWED**.
5. Capability timeline shows each grant opening and being revoked.
6. A planted prompt injection in `support_tickets.message_body` asks for `customers.email` →
   gateway denies, security event logged.
7. Report: "Payment failures after v4.8 explain ~85% of the drop", every sentence linked to an
   evidence node; footer lists columns accessed (e.g. 9/111) vs System A (e.g. 40+/111).

If that demo works end to end, the MVP is done. Everything else is evaluation breadth.

### 1.3 In scope vs deferred

| Area | MVP (by week 9) | Deferred (weeks 10–15) |
|---|---|---|
| Dataset | ShopSim, all 9 tables but **scaled ~10×down** (≈400k rows); scenarios **S1, S2, S4, C1**; 1 seed each | All 10 scenarios × 5 seeds, full scale |
| Catalogue | YAML sensitivity + owner + **preconditions** per table/column | — |
| Policy | P1–P5, YAML rules, `AllowAll` + `StaticAllowlist` engines for Systems A/B | Ablation variants (no-P4, table-level scope) |
| Gateway | sqlglot parse, single-SELECT only, `*` expansion, column resolution incl. WHERE/JOIN/GROUP BY/aggregates, masking, row limit, statement timeout, read-only PG role | aggregate-only views auto-routing |
| Capabilities | Signed (HMAC/JWT) tokens in Redis with TTL; revoke on terminal state | — |
| Sandbox | Docker, `--network none`, 1 vCPU / 512 MB / 60 s / pids 128, read-only rootfs, pre-built image with pandas/scipy/ruptures + `ig_stats` lib | Free-form LLM-written Python beyond templates |
| Agent | Full LangGraph loop (section 3), structured outputs, budgets | Ollama 7–8B ablation |
| Evidence | Score = 0.5E + 0.3S + 0.2T, provenance graph in Postgres | — |
| UI | Start investigation; live hypothesis list, capability timeline, security event feed, report with evidence links | React Flow evidence-graph canvas, Recharts dashboards |
| Threat suite | **~15 cases** covering T1–T6 (2–3 each) as pytest | Full 40 cases |
| Eval | One script that runs A vs C on the 4 scenarios and prints accuracy, DER, sensitive exposure | McNemar/Wilcoxon, bootstrap CIs, 35 held-out runs |

### 1.4 MVP acceptance checks
- S1, S2, S4 root cause correct (top-1) for System C; C1 ends with "no anomalous driver".
- 0 unmasked restricted/confidential columns returned in System C runs.
- All ~15 threat cases blocked/contained.
- System C DER at least 50% lower than System A on the same scenarios.
- `docker compose up` brings up everything.

---

## 2. System architecture

### 2.1 Components and trust boundary

```
                       ┌────────────────────── PRESENTATION ──────────────────────┐
                       │  Agent Studio (React + TS + Tailwind)                    │
                       │  hypotheses │ capability timeline │ alerts │ report      │
                       └───────────────▲──────────────────────────────────────────┘
                                       │ WebSocket (stream events) / REST (start)
┌──────────────────────────────────────┴───────────────────────────────────────────┐
│ FastAPI backend                                                                  │
│                                                                                  │
│  ┌──────── REASONING PLANE (untrusted) ────────┐   ┌──── CONTROL PLANE (trusted) ───┐
│  │ LangGraph investigation graph               │   │ Capability Manager             │
│  │  LLM nodes: understand, hypothesize,        │──▶│ Policy Engine (YAML, P1–P5)    │
│  │  write_query, interpret, report             │   │ Redis capability store (TTL)   │
│  │  Deterministic nodes call ─────────────────────▶│ Audit monitor / security events│
│  │  the control plane via plain Python APIs    │   │ Evidence provenance graph (PG) │
│  └─────────────────────────────────────────────┘   └───────────────┬────────────────┘
│                                                                    │
│  ┌──────── EXECUTION PLANE ────────┐        ┌──────── DATA PLANE ──▼────────────────┐
│  │ Ephemeral Docker sandbox        │◀─CSV───│ SQL Gateway                           │
│  │ --network none, no creds        │  files │  sqlglot AST → column check vs cap    │
│  │ runs ig_stats on result files   │        │  rewrite: mask, LIMIT, timeout        │
│  └─────────────────────────────────┘        │  executes as `ig_reader` (read-only)  │
│                                             └───────────────┬───────────────────────┘
│                                                             ▼
│                                              PostgreSQL 16: shopsim (data)
│                                                             investiguard (audit/evidence)
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Rule:** the LLM proposes, the control plane disposes. Nothing an LLM emits (hypothesis
resources, SQL, code, purpose text) is trusted; every privilege decision is plain code.

### 2.2 Resolving the "no network but reaches gateway" tension
The synopsis says the sandbox has `--network none` *and* reaches data via the gateway. Those
conflict if the gateway is an HTTP service. MVP resolution — **two-phase execution**:

1. LLM writes SQL → orchestrator sends SQL + capability token to the gateway (trusted process).
2. Gateway checks, rewrites, executes, writes the result to a per-run temp dir as Parquet/CSV.
3. Sandbox is started with that dir bind-mounted read-only, runs `ig_stats` (or LLM analysis
   code), writes `result.json` to an output mount.

The sandbox never sees the token, credentials or the DB. This also kills T5 replay from inside
the sandbox by construction.
Post-MVP upgrade (if you want code to issue queries interactively): bind-mount a Unix domain
socket into the container (still `--network none`) served by a gateway proxy that attaches the
token server-side.

### 2.3 Data model (Postgres `investiguard` schema)
- `investigations(id, problem, config[A|B|C], status, started_at, ended_at)`
- `hypotheses(id, inv_id, text, driver, declared_resources jsonb, test_type, plausibility, status, score, parent_id)`
- `capabilities(id, inv_id, hyp_id, resources jsonb, op, mode, purpose, ttl, issued_at, revoked_at, revoke_reason)`
- `policy_decisions(id, cap_request jsonb, decision, failed_check, reason, latency_ms)`
- `queries(id, cap_id, sql_raw, sql_rewritten, columns_used jsonb, verdict, rows, latency_ms)`
- `evidence(id, hyp_id, query_ids, E, S, T, score, summary jsonb)`
- `security_events(id, inv_id, kind[T1..T6], detail jsonb, ts)`
- `report_claims(id, inv_id, text, evidence_ids)`

Provenance graph = these rows joined on FKs; no separate graph DB needed.

### 2.4 Key interfaces (write these first, week 5)

```python
class CapabilityRequest(BaseModel):
    hypothesis_id: str
    resources: list[str]          # "payments.status"
    op: Literal["READ_ROWS", "READ_AGGREGATE"]
    purpose: str
    ttl_s: int = 300

class PolicyDecision(BaseModel):
    allow: bool
    failed_check: Literal["P1","P2","P3","P4","P5"] | None
    reason: str
    mode: Literal["clear","masked","aggregate_only"] | None

class PolicyEngine(Protocol):           # System A = AllowAll, B = StaticAllowlist, C = InvestiGuard
    def decide(self, req: CapabilityRequest, ctx: PolicyContext) -> PolicyDecision: ...

class Gateway:
    def execute(self, sql: str, token: str) -> GatewayResult  # raises GatewayDenied(reason, columns)

class Sandbox:
    def run(self, inputs_dir: Path, test_type: str, params: dict) -> SandboxResult
```

Systems A/B/C differ **only** by which `PolicyEngine` (and gateway strictness) is injected —
same graph, prompts and budgets. That makes the comparison fair and nearly free to build.

### 2.5 Making evidence scoring deterministic
Don't let the LLM write arbitrary stats code in the MVP. Instead each hypothesis picks a
`test_type` from a fixed menu, and the LLM only writes SQL that returns a frame of the agreed shape:

| test_type | SQL must return | `ig_stats` computes |
|---|---|---|
| `rate_shift` | `day, numerator, denominator` | two-proportion z-test → S; change point (PELT) → T; counterfactual × AOV → E |
| `segment_decomp` | `day, segment, metric` | per-segment Δ share → E; Mann–Whitney → S; PELT → T |
| `event_alignment` | `day, metric` + `event_ts` list | T from event-to-change-point gap; E/S from before/after |
| `level_shift` | `day, metric` | PELT + Mann–Whitney; E vs total Δ |

`ig_stats` lives in the sandbox image and is unit-tested against the injected scenarios.

---

## 3. LangGraph orchestration

### 3.1 Shape: one graph, role-specialised nodes (not a chatty multi-agent swarm)
"Agents" here are **roles = nodes**. LLM roles: Analyst, Hypothesizer, Query Writer,
Interpreter, Reporter. Deterministic roles: Planner, Gatekeeper, Executor, Judge, Revoker.
A supervisor/multi-agent chat pattern would put the LLM in charge of routing, which undermines
the whole thesis; here **all routing edges are deterministic functions of state**.

### 3.2 State

```python
class InvState(TypedDict):
    inv_id: str
    config: Literal["A", "B", "C"]
    problem: str
    objective: Objective | None              # metric, magnitude, period, baseline
    hypotheses: dict[str, Hypothesis]        # status: PROPOSED|TESTING|SUPPORTED|REJECTED|INCONCLUSIVE|BLOCKED
    current_h: str | None
    active_cap: Capability | None
    pending_sql: str | None
    query_attempts: int
    last_result: SandboxResult | None
    evidence: Annotated[list[EvidenceNode], operator.add]
    security_events: Annotated[list[SecurityEvent], operator.add]
    budget: Budget                           # iterations, tool_calls, llm_tokens
    explained_share: float
    report: Report | None
```

Keep large blobs (query results) out of state — store in Postgres/files and keep IDs in state,
so checkpoints stay small.

### 3.3 Graph

```
START
  │
  ▼
understand_task (LLM) ──▶ generate_hypotheses (LLM) ──▶ plan_next (det)
                                                           │
                    ┌──────────── no untested / budget out / ≥80% explained ──▶ write_report (LLM) ──▶ teardown ──▶ END
                    │
                    ▼
            request_capability (det: Capability Manager + Policy Engine)
                    │
          DENY ─────┼──────▶ record_denial (det) ──▶ plan_next
                    │ ALLOW
                    ▼
            write_query (LLM; sees ONLY schema of granted columns)
                    ▼
            execute (det: Gateway → files → Sandbox)
                    │
   gateway denied / SQL error & attempts<2 ──▶ write_query      (deny also logs security_event)
   attempts exhausted ──▶ mark INCONCLUSIVE ──▶ revoke
                    │ ok
                    ▼
            score_evidence (det: Score = 0.5E+0.3S+0.2T → classify)
                    ▼
            interpret (LLM: narrative + follow-up hypotheses w/ declared resources)
                    ▼
            revoke (det) ──▶ plan_next
```

Node notes:
- **understand_task** — structured output `Objective`; the LLM sees the catalogue (table/column
  names + descriptions + sensitivity), never data.
- **generate_hypotheses** — ≤8, each with `driver`, `declared_resources`, `test_type`,
  `plausibility∈[0,1]`, `info_gain∈[0,1]`. Validate resources exist in the catalogue; drop
  invalid ones rather than trusting them.
- **plan_next** — `priority = plausibility × info_gain / (1 + 0.5 × privilege_cost)`;
  privilege_cost from catalogue sensitivity weights (public 0, internal 1, confidential 3,
  restricted 10). A BLOCKED hypothesis becomes eligible again when new evidence satisfies its
  precondition (this is how S1's deploy-log request succeeds the second time).
- **request_capability** — calls `PolicyEngine.decide`; on ALLOW mints token in Redis with TTL.
- **write_query** — prompt includes only granted columns. If the model references something
  else anyway, the gateway catches it (and that's a logged event, useful metric).
- **execute** — gateway + sandbox; record `queries` rows with `columns_used`.
- **score_evidence** — pure function; also updates `explained_share`.
- **interpret** — LLM turns numbers into 2–3 sentences; may add follow-ups. Treat any text it
  read from data (e.g. ticket bodies) as untrusted: follow-ups still go through P3/P4.
- **write_report** — structured output: `claims: [{text, evidence_ids}]`; a validator rejects
  claims with no evidence id (target: 100% evidence faithfulness). Phrase as associations.
- **teardown** — revoke all, kill containers, close investigation.

### 3.4 LangGraph features to use
- `StateGraph` + `add_conditional_edges` for every router above.
- `with_structured_output(PydanticModel)` for all LLM nodes; temperature 0.1.
- **Checkpointer** (`PostgresSaver`, or `SqliteSaver` in dev) keyed by `thread_id = inv_id` →
  replay any run, resume after crashes, inspect state per step for debugging/eval.
- **Streaming**: `graph.astream(..., stream_mode=["updates", "custom"])`; deterministic nodes
  emit UI events via `get_stream_writer()` (`cap_granted`, `cap_revoked`, `policy_denied`,
  `security_event`), forwarded to the WebSocket.
- `recursion_limit` as a hard backstop on top of your own budget counters.
- Optional stretch: `interrupt()` before granting any `masked` restricted-column capability
  for human approval — a nice demo of "human in the loop for escalation".
- Model via `init_chat_model(...)` so GPT / Gemini / Ollama are a config switch.

### 3.5 Systems A / B / C on the same graph

| | Policy engine | Gateway | write_query sees |
|---|---|---|---|
| A — unrestricted | `AllowAll` | pass-through (still single-SELECT, still sandboxed code) | full schema |
| B — static sandbox | `StaticAllowlist(tables=…)` chosen once per problem | table-level check | allowlisted tables |
| C — InvestiGuard | `InvestiGuardPolicy` (P1–P5) | column-level + masking | granted columns only |

---

## 4. Repo layout

```
investiguard/
├── docker-compose.yml          # postgres, redis, backend, frontend (sandbox image built, not run)
├── data/
│   ├── shopsim/generate.py     # Faker + NumPy, --scale, --seed, --scenario
│   ├── shopsim/scenarios.py    # S1..S8, C1, C2 injectors
│   └── catalog.yaml            # sensitivity, owner, preconditions
├── backend/
│   ├── api/                    # FastAPI routes + websocket
│   ├── agent/graph.py          # LangGraph build
│   ├── agent/nodes/            # one file per node
│   ├── agent/prompts/
│   ├── control/policy.py       # P1–P5, AllowAll, StaticAllowlist
│   ├── control/capabilities.py # mint/verify/revoke (Redis)
│   ├── control/evidence.py     # provenance writes
│   ├── gateway/gateway.py      # sqlglot checks + rewrite + exec
│   ├── sandbox/runner.py       # docker SDK
│   └── db/models.py
├── sandbox_image/
│   ├── Dockerfile
│   └── ig_stats/               # rate_shift, segment_decomp, ...
├── frontend/                   # Vite + React + TS + Tailwind
├── tests/
│   ├── test_policy.py
│   ├── test_gateway.py         # biggest test file: alias smuggling, subqueries, CTEs, *
│   ├── test_ig_stats.py
│   └── threats/                # T1..T6 cases
└── eval/run_eval.py
```

---

## 5. Week-by-week to the MVP (two people)

| Week | Person 1 (control & data) | Person 2 (agent & UI) |
|---|---|---|
| **5** (now) | catalog.yaml; ShopSim generator for S1/S2/S4/C1 at small scale; load into PG; read-only `ig_reader` role | Pydantic interfaces (2.4); LangGraph skeleton with stub nodes and fake policy; repo + compose |
| **6** | Gateway: sqlglot parse/resolve/check/rewrite + `test_gateway.py` (aim ~30 cases) | LLM nodes: understand, hypothesize, write_query with structured outputs; run against System A |
| **7** | Policy P1–P5 + Redis capabilities + revocation; sandbox runner + image + `ig_stats` | plan_next priority, routers, budgets, checkpointer; S1 end to end on System C |
| **8** | Evidence/provenance tables; threat tests T1–T6 (~15) | FastAPI + WebSocket streaming; Agent Studio panels |
| **9** | `eval/run_eval.py` (A vs C, 4 scenarios); bug fixing | Report node + claim validator; demo polish; dry-run the demo script (1.2) |

**Build order principle:** get System A (no policy) solving S1 end to end in week 6–7 *first*.
If the unrestricted agent can't find the cause, no amount of policy work will save the demo;
then tighten to System C and watch what breaks.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM writes SQL of the wrong shape for `ig_stats` | Few-shot examples per test_type; validate frame columns before sandbox; 2 retries with error text |
| P4 too strict → false denials, agent stalls | Log every DENY with failed check; tune preconditions on dev scenarios (S4, C1) only; track false-denial rate |
| sqlglot edge cases (CTEs, subqueries, aliases, `USING`, window fns) | Use `sqlglot.optimizer.qualify` to fully qualify columns before checking; deny anything unresolved (fail closed) |
| Docker startup latency per hypothesis | Pre-pull image; reuse one container per investigation with fresh input mounts, destroy at teardown |
| Synthetic signal too weak / too obvious | Scenario injector has a `strength` knob; verify with a notebook that each injected cause is detectable before agent work |
| Token cost / time | Budgets (12 iterations / 40 tool calls); cache catalogue prompt; small scale data |

---

## 7. Things noticed in the synopsis
- **Sandbox network vs gateway** — see 2.2; worth adding one sentence to the methodology.
- **USN mismatch** — cover page says Archit is `1RV24IS015`, signature block says `1RV24IS014`.
- Evidence scoring "computed in the sandbox" + "LLM writes analysis code" can conflict with
  determinism; the test_type menu in 2.5 reconciles them.
