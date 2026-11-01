"""Structured outputs for the LLM nodes. Everything the LLM returns is untrusted input."""
from typing import Literal

from pydantic import BaseModel, Field


class Objective(BaseModel):
    question_type: Literal["change_investigation", "lookup"] = Field(
        description="'change_investigation' if the problem says a metric rose/fell between periods and asks why; "
                    "'lookup' for any direct question (lists, rankings, totals, 'which/what/how many') that "
                    "just needs one query")
    metric: str = Field(description="Business metric that changed, e.g. 'revenue'")
    metric_definition: str = Field(description="How to compute it from the catalogue, in words")
    incident_period: str = Field(description="Period where the change happened, e.g. '2026-09-01 to 2026-09-30'")
    baseline_period: str = Field(description="Comparison period, e.g. '2026-08-01 to 2026-08-31'")
    change_pct: float = Field(description="Reported change in percent, negative for a fall")
    metric_columns: list[str] = Field(description="table.column needed to compute the metric over the two periods "
                                                  "(amount/value, date or period column, and any status/type filter)")


class ProposedHypothesis(BaseModel):
    statement: str = Field(description="One testable explanation for the change")
    driver: str = Field(description="Short driver label, e.g. 'payment failures', 'regional outage'")
    kind: Literal["decomposition", "event"] = Field(
        description="'decomposition' if testable by splitting the metric by a driver column (segment, status, "
                    "type, item); 'event' if it looks up events in another table (releases, campaigns, logs)")
    resources: list[str] = Field(description="Minimal list of table.column needed to test it")
    plausibility: float = Field(description="Prior plausibility 0..1")
    info_gain: float = Field(description="How much testing it would narrow the search, 0..1")


class Hypotheses(BaseModel):
    hypotheses: list[ProposedHypothesis]


class QueryPlan(BaseModel):
    sql: str = Field(description="One read-only SELECT statement")
    rationale: str = Field(description="What the result will show")


class Interpretation(BaseModel):
    finding: str = Field(description="One or two sentences citing the numbers from the result")
    verdict: Literal["SUPPORTED", "REJECTED", "INCONCLUSIVE"] = Field(
        description="Used only for 'event' hypotheses; decomposition verdicts are computed in code")
    follow_ups: list[ProposedHypothesis] = Field(description="Narrower follow-up hypotheses, at most 2; empty if none")


class Claim(BaseModel):
    text: str
    evidence_ids: list[str] = Field(description="Evidence node ids (e.g. 'E2') backing this claim")


class Report(BaseModel):
    root_cause: str = Field(description="Most likely root cause in one sentence, or 'no anomalous driver found'")
    plain_summary: str = Field(description="3-5 short sentences for a non-technical reader (see instructions)")
    summary: str
    claims: list[Claim]
    limitations: str
