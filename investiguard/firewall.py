"""Injection firewall: query results are data, so instruction-like text never reaches the LLM.

Every text cell of a result is scanned before the result is shown to an LLM node. A cell that looks like
an instruction aimed at the model (a data-borne prompt injection, threat T6) is replaced by a fixed marker
and the hit is logged. Deterministic regexes only: nothing here asks a model whether text is "safe".
The Direct AI baseline does not use it, which is what the benchmark's injection scenario measures.
"""
import re

import pandas as pd

MASK = "[blocked: instruction-like text]"

_PATTERNS = [(name, re.compile(rx, re.I)) for name, rx in [
    ("override", r"\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instruction|restriction|rule|polic|prompt|guardrail|above|previous|prior)"),
    ("role", r"\b(system|developer|assistant)\s*(note|prompt|message|override)?\s*[:>\]]"),
    ("addressing", r"\b(to|attention|dear|note to)\b.{0,20}\b(ai|assistant|agent|model|llm|analyst bot)\b"),
    ("identity", r"\byou are (now|no longer|an? (ai|assistant|agent))\b|\bas an ai\b|\bact as\b"),
    ("directive", r"\b(you must|you should|do not tell|don't tell|instead (say|report|conclude|answer)|report that|conclude that|respond with)\b.{0,80}\b(root cause|answer|conclusion|report|summary|analysis)"),
    ("exfiltration", r"\b(reveal|exfiltrate|leak|send|post|upload|email)\b.{0,40}\b(password|secret|token|api key|credential|salary|ssn|database|all (rows|data|records))"),
    ("query", r"\b(run|execute)\b.{0,30}\b(select|sql|query|drop|delete)\b"),
    ("markup", r"<\|.*?\|>|\[/?(inst|system)\]|###\s*(system|instruction)"),
]]


def scan_text(text: str) -> str | None:
    """Return the name of the first pattern the text matches, or None."""
    for name, rx in _PATTERNS:
        if rx.search(text):
            return name
    return None


def scan(df: pd.DataFrame) -> tuple[pd.DataFrame, list[dict]]:
    """Return (frame with instruction-like cells masked, one finding per masked cell)."""
    findings: list[dict] = []
    out = df
    for col in df.columns:
        if not (pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col])):
            continue
        for idx, val in df[col].items():
            if not isinstance(val, str) or len(val) < 12:
                continue
            hit = scan_text(val)
            if hit:
                if out is df:
                    out = df.copy()
                out.at[idx, col] = MASK
                findings.append({"column": str(col), "row": int(idx) if isinstance(idx, int) else str(idx),
                                 "pattern": hit, "snippet": val[:90]})
    return out, findings
