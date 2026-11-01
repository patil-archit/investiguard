"""Deterministic evidence scoring (synopsis 5.3d, explained-share component E).

Decomposition queries must return the shape  segment | baseline | incident  with one row per driver
value plus a row segment='ALL' holding the overall metric. The verdict is computed here, not by the LLM:

  total_delta  = ALL.incident - ALL.baseline
  top segment  = the segment with the largest |incident - baseline|
  E (share)    = min(1, |top delta| / |total_delta|)
  base_share   = top.baseline / ALL.baseline          (how big the segment already was)
  lift         = E / base_share                        (did it move more than its size explains?)

  |top delta| > 1.2 x |total delta| and >= 30% of it reappears in segments that were empty in the
  baseline                  -> INCONCLUSIVE (possible re-labelling, e.g. an area renamed mid-year)
  base_share > 0.8          -> INCONCLUSIVE (segment ~ the whole metric: restates the problem)
  E >= 0.4 and lift >= 1.2  -> SUPPORTED
  E < 0.15                  -> REJECTED
  otherwise                 -> INCONCLUSIVE
"""
import pandas as pd

SUPPORT_SHARE, REJECT_SHARE, MIN_LIFT, MAX_BASE_SHARE = 0.4, 0.15, 1.2, 0.8
RELABEL_RATIO, RELABEL_OFFSET = 1.2, 0.3


def normalise(df: pd.DataFrame) -> tuple[pd.DataFrame | None, str | None]:
    """Validate the decomposition shape. Returns (frame, None) or (None, error for the query writer)."""
    cols = {c.lower().strip(): c for c in df.columns}
    missing = [c for c in ("segment", "baseline", "incident") if c not in cols]
    if missing:
        return None, f"result must have columns segment, baseline, incident; missing {missing}, got {list(df.columns)}"
    out = df[[cols["segment"], cols["baseline"], cols["incident"]]].copy()
    out.columns = ["segment", "baseline", "incident"]
    out["segment"] = out["segment"].astype(str)
    for c in ("baseline", "incident"):
        out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0)
    if not (out["segment"].str.upper() == "ALL").any():
        return None, "result must include a row with segment = 'ALL' holding the overall metric for both periods"
    if len(out) < 2:
        return None, "result must include at least one driver segment besides 'ALL'"
    return out, None


def score(df: pd.DataFrame) -> dict:
    is_all = df["segment"].str.upper() == "ALL"
    all_row = df[is_all].iloc[0]
    segs = df[~is_all].copy()
    segs["delta"] = segs["incident"] - segs["baseline"]
    total_b, total_i = float(all_row["baseline"]), float(all_row["incident"])
    total_delta = total_i - total_b
    top = segs.loc[segs["delta"].abs().idxmax()]
    top_delta = float(top["delta"])

    if total_delta == 0:
        share = 0.0
    else:
        share = min(1.0, abs(top_delta) / abs(total_delta))
    base_share = float(top["baseline"]) / total_b if total_b else 0.0
    lift = share / abs(base_share) if base_share else float("inf")

    # Re-labelling check: the top segment moved more than the whole metric, and much of that movement
    # reappears in segments that were (almost) empty in the baseline, e.g. an area or code renamed mid-year.
    new_segs = segs[(segs["baseline"].abs() <= 0.01 * abs(total_b)) & (segs["delta"] * top_delta < 0)]
    reappeared = float(new_segs["delta"].abs().sum())
    relabel = (total_delta != 0 and abs(top_delta) > RELABEL_RATIO * abs(total_delta)
               and reappeared >= RELABEL_OFFSET * abs(top_delta))

    if relabel:
        names = ", ".join(f"'{s}'" for s in new_segs.sort_values("delta", key=abs, ascending=False)["segment"][:3])
        verdict, share = "INCONCLUSIVE", 0.0
        why = (f"possible re-labelling: '{top['segment']}' moved {abs(top_delta):,.0f}, more than the total change "
               f"({abs(total_delta):,.0f}), and {reappeared:,.0f} reappeared in segments new this period ({names}); "
               "test a driver column that is stable across periods")
    elif 0 < base_share and abs(base_share) > MAX_BASE_SHARE:
        verdict, share, why = "INCONCLUSIVE", 0.0, (f"'{top['segment']}' is {base_share:.0%} of the baseline metric, "
                                        "so it restates the problem rather than isolating a cause")
    elif share >= SUPPORT_SHARE and lift >= MIN_LIFT:
        verdict, why = "SUPPORTED", f"'{top['segment']}' explains {share:.0%} of the change (lift {lift:.1f}x its size)"
    elif share < REJECT_SHARE:
        verdict, why = "REJECTED", f"largest mover '{top['segment']}' explains only {share:.0%} of the change"
    else:
        verdict, why = "INCONCLUSIVE", f"'{top['segment']}' explains {share:.0%} of the change (lift {lift:.1f}x)"

    ranked = segs.reindex(segs["delta"].abs().sort_values(ascending=False).index).head(5)
    return {
        "verdict": verdict, "reason": why, "explained_share": round(share, 3),
        "top_segment": str(top["segment"]), "driver_delta": round(top_delta, 2),
        "total_baseline": round(total_b, 2), "total_incident": round(total_i, 2),
        "total_delta": round(total_delta, 2), "base_share": round(base_share, 3),
        "lift": round(lift, 2) if lift != float("inf") else None,
        "possible_relabel": bool(relabel), "reappeared_in_new_segments": round(reappeared, 2),
        "top_movers": [{"segment": r.segment, "baseline": round(r.baseline, 2), "incident": round(r.incident, 2),
                        "delta": round(r.delta, 2)} for r in ranked.itertuples()],
    }


def money(x: float, currency: str = "INR") -> str:
    sign, x = ("-" if x < 0 else ""), abs(x)
    if currency == "INR":
        if x >= 1e7:
            return f"{sign}₹{x / 1e7:.1f} crore"
        if x >= 1e5:
            return f"{sign}₹{x / 1e5:.1f} lakh"
        return f"{sign}₹{x:,.0f}"
    sym = {"USD": "$", "EUR": "€", "GBP": "£"}.get(currency, "")
    if x >= 1e6:
        return f"{sign}{sym}{x / 1e6:.1f} million"
    return f"{sign}{sym}{x:,.0f}"


def plain_facts(evidence_nodes: list[dict], hypotheses: dict, currency: str = "INR") -> list[str]:
    """Key numbers in everyday language, computed from the evidence engine's stats (never by the LLM)."""
    scored = [e for e in evidence_nodes if e.get("stats")]
    if not scored:
        return []
    facts = []
    s0 = scored[0]["stats"]
    b, i = s0["total_baseline"], s0["total_incident"]
    pct = f" ({(i - b) / abs(b):+.0%})" if b else ""
    facts.append(f"Overall it went from {money(b, currency)} to {money(i, currency)}, "
                 f"a change of {money(i - b, currency)}{pct}.")
    seen = set()
    for e in sorted(scored, key=lambda e: -e["stats"]["explained_share"]):
        st = e["stats"]
        key = st["top_segment"].strip().lower()
        if e["verdict"] == "SUPPORTED" and key not in seen:
            seen.add(key)
            facts.append(f"'{st['top_segment']}' changed by {money(st['driver_delta'], currency)}, "
                         f"which is about {st['explained_share']:.0%} of the overall change.")
    for e in scored:
        st = e["stats"]
        if st.get("possible_relabel"):
            facts.append(f"'{st['top_segment']}' looks like a big drop, but most of it reappears under new "
                         "names in the latest period, so it is likely a change in how things are recorded, "
                         "not a real drop.")
    ruled_out = [hypotheses[e["hypothesis"]]["driver"] for e in scored if e["verdict"] == "REJECTED"]
    if ruled_out:
        facts.append("Checked and ruled out as main causes: " + ", ".join(dict.fromkeys(ruled_out)) + ".")
    return facts
