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
  E >= 0.4 and lift >= 1.5  -> SUPPORTED
  E < 0.15                  -> REJECTED
  otherwise                 -> INCONCLUSIVE

Two further terms are reported with every verdict:
  significance S = robust z-score of the top segment's % change against the other segments' % changes
                   (median / MAD), so "everything fell about the same" scores low
  confidence     = 0.5 E + 0.25 min(lift/3, 1) + 0.25 min(|z|/3, 1)

Drill-downs on a supported segment use two more fixed shapes, also scored here:
  price_volume()  segment | baseline | incident | baseline_qty | incident_qty   -> price vs volume effect
  onset()         period | segment_value | total_value                          -> when the change began (T)
"""
import math

import pandas as pd

SUPPORT_SHARE, REJECT_SHARE, MIN_LIFT, MAX_BASE_SHARE = 0.4, 0.15, 1.5, 0.8
PARTITION_SLACK, TOTAL_TOLERANCE = 1.05, 0.02
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
    # Segments are a partition (or, for a loss-type driver, a subset) of the metric, so they can never add
    # up to more than the ALL row. If they do, the ALL row or the segment filters are wrong.
    is_all = out["segment"].str.upper() == "ALL"
    all_row = out[is_all].iloc[0]
    for c in ("baseline", "incident"):
        seg_sum, total = abs(out.loc[~is_all, c].sum()), abs(float(all_row[c]))
        if seg_sum > PARTITION_SLACK * total + 1e-9:
            return None, (f"the segment rows add up to {seg_sum:,.2f} in {c}, more than the ALL row ({total:,.2f}); "
                          "the ALL row must hold the overall metric with exactly the same filters as the segments")
    return out, None


def totals_disagree(stats: dict, previous: list[tuple[float, float]]) -> str | None:
    """Every decomposition measures the same metric, so its ALL row must match the others.

    The reference is a total that at least two earlier queries agree on; with fewer there is nothing to check.
    """
    def close(a, b):
        return abs(a - b) <= TOTAL_TOLERANCE * max(abs(a), abs(b), 1e-9)

    for ref in previous:
        votes = sum(close(ref[0], p[0]) and close(ref[1], p[1]) for p in previous)
        if votes >= 2:
            b, i = stats["total_baseline"], stats["total_incident"]
            if close(b, ref[0]) and close(i, ref[1]):
                return None
            return (f"the ALL row gives baseline {b:,.2f} and incident {i:,.2f}, but earlier queries agree the overall "
                    f"metric is baseline {ref[0]:,.2f} and incident {ref[1]:,.2f}; fix the period or status filters")
    return None


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

    z = _significance(segs, top, total_b)
    lift_term = min((lift if lift != float("inf") else 3) / 3, 1)
    confidence = 0.0 if verdict != "SUPPORTED" else round(
        0.5 * share + 0.25 * lift_term + 0.25 * (min(abs(z) / 3, 1) if z is not None else lift_term), 2)
    ranked = segs.reindex(segs["delta"].abs().sort_values(ascending=False).index).head(5)
    return {
        "kind": "decomposition", "significance_z": z, "confidence": confidence,
        "verdict": verdict, "reason": why, "explained_share": round(share, 3),
        "top_segment": str(top["segment"]), "driver_delta": round(top_delta, 2),
        "total_baseline": round(total_b, 2), "total_incident": round(total_i, 2),
        "total_delta": round(total_delta, 2), "base_share": round(base_share, 3),
        "lift": round(lift, 2) if lift != float("inf") else None,
        "possible_relabel": bool(relabel), "reappeared_in_new_segments": round(reappeared, 2),
        "top_movers": [{"segment": r.segment, "baseline": round(r.baseline, 2), "incident": round(r.incident, 2),
                        "delta": round(r.delta, 2)} for r in ranked.itertuples()],
    }


def _significance(segs: pd.DataFrame, top, total_b: float) -> float | None:
    """Robust z-score of the top segment's % change against the other sizeable segments."""
    sizeable = segs[(segs["baseline"].abs() >= 0.01 * abs(total_b)) & (segs["baseline"] != 0)]
    others = sizeable[sizeable["segment"] != top["segment"]]
    if len(others) < 3 or not top["baseline"]:
        return None
    rates = others["delta"] / others["baseline"]
    med = float(rates.median())
    mad = float((rates - med).abs().median()) * 1.4826
    if mad < 1e-9:
        mad = max(float(rates.std(ddof=0)), 0.01)
    return round(max(-10.0, min(10.0, (float(top["delta"] / top["baseline"]) - med) / mad)), 2)


def _columns(df: pd.DataFrame, need: tuple[str, ...]) -> tuple[pd.DataFrame | None, str | None]:
    cols = {c.lower().strip(): c for c in df.columns}
    missing = [c for c in need if c not in cols]
    if missing:
        return None, f"result must have columns {', '.join(need)}; missing {missing}, got {list(df.columns)}"
    out = df[[cols[c] for c in need]].copy()
    out.columns = list(need)
    out[need[0]] = out[need[0]].astype(str)
    for c in need[1:]:
        out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0)
    return out, None


def price_volume(df: pd.DataFrame, focus: str) -> tuple[dict | None, str | None]:
    """Split the focus segment's change into a volume effect and a price effect (they sum to the change).

    volume effect = (q1 - q0) * p0     price effect = (p1 - p0) * q1     with p = value / quantity
    """
    out, err = _columns(df, ("segment", "baseline", "incident", "baseline_qty", "incident_qty"))
    if err:
        return None, err
    rows = out[out["segment"].str.upper() != "ALL"]
    if rows.empty:
        return None, f"result must include one row for the segment '{focus}'"
    match = rows[rows["segment"].str.strip().str.lower() == focus.strip().lower()]
    r = (match if not match.empty else rows.reindex((rows["incident"] - rows["baseline"]).abs()
                                                    .sort_values(ascending=False).index)).iloc[0]
    v0, v1, q0, q1 = (float(r[c]) for c in ("baseline", "incident", "baseline_qty", "incident_qty"))
    if q0 <= 0 or q1 <= 0:
        return None, "baseline_qty and incident_qty must both be positive for the focus segment"
    p0, p1 = v0 / q0, v1 / q1
    vol, price, delta = (q1 - q0) * p0, (p1 - p0) * q1, v1 - v0
    if delta == 0:
        return None, "the focus segment did not change between the periods"
    vol_share, price_share = vol / delta, price / delta
    main = "volume" if abs(vol) >= abs(price) else "price"
    why = (f"within '{r['segment']}', quantity changed {(q1 - q0) / q0:+.0%} and price per unit {(p1 - p0) / p0:+.0%}: "
           f"{main} accounts for {max(vol_share, price_share):.0%} of its change")
    return {
        "kind": "price_volume", "verdict": "SUPPORTED", "reason": why, "explained_share": 0.0,
        "top_segment": str(r["segment"]), "main_effect": main,
        "volume_effect": round(vol, 2), "price_effect": round(price, 2), "driver_delta": round(delta, 2),
        "volume_share": round(vol_share, 3), "price_share": round(price_share, 3),
        "qty_change_pct": round((q1 - q0) / q0, 4), "price_change_pct": round((p1 - p0) / p0, 4),
        "baseline_qty": round(q0, 2), "incident_qty": round(q1, 2),
        "baseline_price": round(p0, 4), "incident_price": round(p1, 4),
    }, None


def onset(df: pd.DataFrame, focus: str) -> tuple[dict | None, str | None]:
    """Find when the focus segment's level shifted: the split that maximises the mean shift (CUSUM-style)."""
    out, err = _columns(df, ("period", "segment_value", "total_value"))
    if err:
        return None, err
    out = out.groupby("period", as_index=False)[["segment_value", "total_value"]].sum()
    out = out.sort_values("period").reset_index(drop=True)
    n = len(out)
    if n < 4:
        return None, f"need at least 4 periods (e.g. months) to locate the onset, got {n}"
    empty = int((out["total_value"] == 0).sum())
    if empty > n // 3:
        return None, (f"total_value is zero in {empty} of {n} periods; do not put the baseline or incident date range "
                      "inside the CASE expressions, sum every period in the WHERE range")
    s = out["segment_value"]
    best_k, best = None, 0.0
    for k in range(1, n):
        stat = abs(s[k:].mean() - s[:k].mean()) * math.sqrt(k * (n - k) / n)
        if stat > best:
            best_k, best = k, stat
    before, after = float(s[:best_k].mean()), float(s[best_k:].mean())
    noise = float(pd.concat([s[:best_k] - before, s[best_k:] - after]).std(ddof=0)) or 1e-9
    strength = abs(after - before) / noise
    rest = out["total_value"] - s
    rest_shift = float(rest[best_k:].mean() - rest[:best_k].mean())
    specific = abs(rest_shift) < 0.5 * abs(after - before)
    clear = strength >= 2
    period = str(out["period"][best_k])
    why = (f"'{focus}' shifted from about {before:,.0f} to {after:,.0f} per period starting {period}"
           + (" (clear step)" if clear else " (gradual or noisy)")
           + ("; the rest of the metric did not shift at that point" if specific else
              "; the rest of the metric shifted at the same time"))
    return {
        "kind": "timeline", "verdict": "SUPPORTED" if clear else "INCONCLUSIVE", "reason": why,
        "explained_share": 0.0, "top_segment": focus, "onset_period": period,
        "before_mean": round(before, 2), "after_mean": round(after, 2), "step_strength": round(strength, 2),
        "specific_to_segment": bool(specific),
        "series": [{"period": str(r.period), "segment": round(r.segment_value, 2),
                    "rest": round(r.total_value - r.segment_value, 2)} for r in out.itertuples()],
    }, None


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
    drills = [e for e in evidence_nodes if (e.get("stats") or {}).get("kind") in ("price_volume", "timeline")]
    scored = [e for e in evidence_nodes if e.get("stats") and e not in drills]
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
    for e in drills:
        st = e["stats"]
        if st["kind"] == "price_volume":
            main, other = ("quantity", "price") if st["main_effect"] == "volume" else ("price", "quantity")
            share = st["volume_share"] if st["main_effect"] == "volume" else st["price_share"]
            facts.append(f"Within '{st['top_segment']}', about {min(share, 1):.0%} of the change came from {main} "
                         f"(quantity {st['qty_change_pct']:+.0%}, price per unit {st['price_change_pct']:+.0%}), "
                         f"not from {other}.")
        elif e["verdict"] == "SUPPORTED":
            facts.append(f"The change in '{st['top_segment']}' started around {st['onset_period']}"
                         + ("; nothing else moved at that time." if st["specific_to_segment"] else "."))
    ruled_out = [hypotheses[e["hypothesis"]]["driver"] for e in scored if e["verdict"] == "REJECTED"]
    if ruled_out:
        facts.append("Checked and ruled out as main causes: " + ", ".join(dict.fromkeys(ruled_out)) + ".")
    return facts
