# InvestiGuard

A hypothesis-driven root-cause agent built on LangGraph. It works on **any dataset you give it** and
only ever holds column-level, time-bound, read-only capabilities. A deterministic policy engine grants
those capabilities, and an SQL gateway checks every query against them.

## Run
```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # put your OPENAI_API_KEY in it
.venv/bin/python -m pytest -q
./run.sh                      # builds the React app if needed → http://localhost:8765
```
- **Web app (main UI):** React 19, TypeScript, Tailwind CSS v4, Recharts, Mermaid and lucide icons in
  `frontend/`, served by the FastAPI backend in `server/api.py`. Investigations stream live over
  server-sent events.
- **Frontend development with hot reload:** run `.venv/bin/uvicorn server.api:app --port 8765` in one
  terminal and `cd frontend && npm run dev` in another, then open http://localhost:5173 (it proxies
  `/api`).
- **Streamlit studio (fallback):** `.venv/bin/streamlit run app.py`.

## Bring your own data (Data tab)
- **Upload:** CSV, TSV, TXT (the delimiter is detected automatically), Excel `.xlsx`/`.xls` (every sheet
  becomes a table), JSON (a list of records, or an object holding lists of records; nested fields are
  flattened), JSONL/NDJSON, Parquet, or a SQLite file. Each dataset gets its own read-only SQLite
  database under `data/datasets/`.
- **Connect:** a PostgreSQL, MySQL or SQLite URL. If the URL contains a password, it is stored in `.env`
  (`IG_DS_<NAME>_URL`), never in `datasets.yaml`. Use a read-only database account.
- **Cleaning on ingest:** column names become SQL-safe (`Revenue (INR)` → `revenue_inr`; reserved
  words such as `group` → `group_name`). Dates in any common format, including day-first `dd/mm/yyyy`,
  become ISO text. Empty columns are dropped. If two files produce the same table name, both are kept.
- **Onboarding** (`investiguard/onboard.py`) runs these steps:
  1. **Catalogue:** sensitivity labels are guessed from column names (email/phone/address →
     confidential; card/salary/bank/PAN → restricted), and log/ticket-style tables get the P4 evidence
     gate.
  2. **Column descriptions:** drafted by the AI. It sees sample values only for non-sensitive columns.
  3. **Date coverage:** each table's date range is added to its description by code.
  4. **Suggested problems:** computed deterministically (`investiguard/profile.py`). Code finds date and
     additive value columns (prices, rates and ratios are excluded), compares year-on-year,
     quarter-on-quarter and month-on-month changes per day, and ranks longer windows first.
  5. **Example questions:** drafted by the AI from the catalogue.
- **Review the catalogue** in the Data tab. You can edit sensitivity labels, descriptions and evidence
  gates there, then save.

From the command line:
```bash
.venv/bin/python -m investiguard.ingest file1.xlsx file2.csv --name my_data
```

## What's inside
- **LangGraph investigation loop:** understand → hypothesize → plan (privilege-aware) → request
  capability → write SQL → gateway → evidence engine → interpret → revoke → … → report. The LLM nodes only
  propose. Every routing edge, grant and verdict is decided by code. Direct lookup questions are sent to
  the Ask tab instead.
- **Policy engine P1–P5** (`investiguard/policy.py`).
- **Capabilities** (`investiguard/capabilities.py`): signed JWTs bound to one hypothesis, with a TTL and
  revocation.
- **SQL gateway** (`investiguard/gateway.py`): resolves every column through the sqlglot AST (including
  `*`, aliases, CTEs, sub-queries and UNIONs), enforces COUNT-only columns, adds a row limit, runs
  queries read-only, and fails closed.
- **Evidence engine** (`investiguard/agent/evidence.py`): decides every verdict in code.
  - *Decomposition:* explained share, lift, a specificity check, relabelling detection, a robust
    significance z-score and a confidence figure.
  - *Price vs volume:* on each supported segment, splits the change into a quantity effect and a
    price-per-unit effect that sum exactly to the change.
  - *Onset timing:* finds the period where the segment's level shifted, and whether the rest of the
    metric moved at the same time.

  The two drill-downs are added by code, not proposed by the LLM, and never count toward the stop rule.
- **Dimension sweep:** after the LLM proposes hypotheses, code adds a cheap, low-priority test for each
  untested non-sensitive categorical column of the metric's table and of tables that join to it (taking
  tables in turn), so a whole class of causes cannot be skipped because the LLM did not think of it.
- **Result-consistency guards:** segments may not add up to more than the ALL row, every query's ALL row
  must match the overall metric that earlier queries agree on, and a timing series with empty periods is
  sent back for a fix. Each is returned to the query writer as an error to correct.
- **Injection firewall** (`investiguard/firewall.py`): instruction-like text in query results is masked
  before any LLM node sees it, and each hit is logged.
- **Step-up approval:** with "Ask me before gated access" on, an evidence-gate (P4) or budget (P5) denial
  pauses the run until you approve or deny it. An approval opens only those columns, once, for 2 minutes.
  P1–P3 can never be waived.
- **Access ledger** (`investiguard/ledger.py`): every event of a run is hash-chained and sealed into a
  signed receipt. The report can re-verify it, and can show that a single edited entry breaks the seal.
- **Privilege over time:** from the grant and revoke events, the report plots how many columns were open
  at each moment and reports the area under that curve as column·seconds.
- **Code sandbox** (`investiguard/sandbox.py`, `sandbox/`): LLM-written Python runs only inside a Docker
  container with no network, a read-only filesystem, a non-root user, all capabilities dropped, and
  time, memory and process limits. It receives only rows a capability already released. Ask-your-data
  uses it for calculations SQL does poorly. Without Docker the step is skipped; code never runs
  unsandboxed.
- **Direct AI baseline** (`investiguard/agent/direct.py`): the comparison mode. One AI analyst sees every
  column, runs free-form queries and states the reason itself, with no hypotheses, no policy, no firewall
  and no evidence engine. The "InvestiGuard vs AI" page puts the two runs side by side.
- **Ask your data** (`investiguard/ask.py`): NL → SQL, under the same trust boundary.
- **Benchmark** (`investiguard/bench/`): six synthetic datasets, each with one planted root cause
  (a region, a price cut, a volume drop, a relabelling decoy, a planted prompt injection, a cause next
  to personal data). Both modes are run and scored by code against the planted answer.
  ```bash
  .venv/bin/python -m investiguard.bench            # writes benchmarks/latest.json, shown on the Benchmark page
  ```
- **Agent Studio** (`app.py`, `investiguard/ui/`): the Streamlit fallback, with the Investigate, Ask,
  InvestiGuard vs Direct AI, Data and How it works tabs.
- **Tests:** 65 cases covering the gateway, policy and token threats, the agent loop, the evidence
  engine, its drill-downs and result-consistency guards, the firewall, the ledger, step-up approval, sandbox escape attempts
  (skipped when Docker is not running), ingest of every format, profiling and the benchmark scoring.

Not built:
- Redis capability store (the store is in memory; finished runs are saved under `data/runs/`).
- Mix effect in the price/volume split (it splits one segment, not a basket of products).

## Bundled datasets
- **inventory**: 349k SAP stores movements from FY2020-25. The known answer for the default problem:
  FY24-25 consumption fell ₹18.4 cr, and fuel (steam coal, volume −20%) explains about 71% of it.
- **retail_chain**: a synthetic 3-sheet Excel workbook (`samples/retail_chain.xlsx`). Store S1 (Pune)
  was closed for renovation from 2025-08-10, and the agent attributes the Q3 revenue drop to S1.
- **demo**: synthetic e-commerce data with an injected payment-service incident, a planted prompt
  injection and a decoy `employee_records` table. Type `scripted-demo` as the model to run the UI
  offline.
