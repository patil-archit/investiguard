"""Visual layer for the Studio: one stylesheet plus small HTML helpers.

Every dynamic string is HTML-escaped: hypotheses, findings and SQL come from the LLM or the data and are
untrusted.
"""
from html import escape

import streamlit as st

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --ig-bg: #0B0F1A; --ig-card: #121829; --ig-card-2: #171F33; --ig-border: #262E45;
  --ig-text: #E7E9F3; --ig-muted: #9AA3BC; --ig-accent: #8B7CFF; --ig-accent-2: #3FC1C9;
  --ig-green: #34D399; --ig-red: #F87171; --ig-amber: #FBBF24; --ig-blue: #60A5FA; --ig-grey: #94A3B8;
}
html, body, [class*="css"], .stMarkdown, .stText, button, input, textarea, select {
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
}
code, pre, .stCode { font-family: 'JetBrains Mono', ui-monospace, monospace !important; }

.block-container { padding-top: 1.2rem; padding-bottom: 3rem; max-width: 1440px; }
header[data-testid="stHeader"] { background: transparent; }

/* sidebar */
section[data-testid="stSidebar"] { background: linear-gradient(180deg, #10162A 0%, #0B0F1A 100%);
  border-right: 1px solid var(--ig-border); }
section[data-testid="stSidebar"] .block-container { padding-top: 1rem; }
.ig-brand { display:flex; align-items:center; gap:.6rem; margin:.2rem 0 .3rem; }
.ig-brand .logo { width:38px; height:38px; border-radius:11px; display:grid; place-items:center; font-size:20px;
  background: linear-gradient(135deg, var(--ig-accent), var(--ig-accent-2)); box-shadow: 0 6px 18px rgba(139,124,255,.35); }
.ig-brand .name { font-weight:800; font-size:1.25rem; letter-spacing:-.02em; }
.ig-brand .tag { color:var(--ig-muted); font-size:.78rem; line-height:1.3; }
.ig-side-label { color:var(--ig-muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em;
  margin:1rem 0 .3rem; font-weight:600; }

/* hero */
.ig-hero { position:relative; border-radius:18px; padding:22px 26px; margin-bottom:14px;
  background: radial-gradient(1200px 300px at 0% 0%, rgba(139,124,255,.22), transparent 60%),
              radial-gradient(800px 260px at 100% 0%, rgba(63,193,201,.16), transparent 60%), var(--ig-card);
  border:1px solid var(--ig-border); }
.ig-hero h1 { font-size:1.65rem; font-weight:800; letter-spacing:-.025em; margin:0 0 4px; padding:0; }
.ig-hero p { color:var(--ig-muted); margin:0; font-size:.95rem; }
.ig-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.ig-chip { font-size:.76rem; padding:4px 10px; border-radius:999px; border:1px solid var(--ig-border);
  background: rgba(255,255,255,.03); color: var(--ig-text); }
.ig-chip b { color: var(--ig-accent); font-weight:600; }

/* tabs (react-aria markup in Streamlit >= 1.5x; baseweb selectors kept for older versions) */
.stTabs [role="tablist"] { gap:4px; background: var(--ig-card); padding:5px; border-radius:14px;
  border:1px solid var(--ig-border); width:fit-content; max-width:100%; }
.stTabs [role="tab"], .stTabs [data-testid="stTab"] { height:40px; padding:0 16px !important; border-radius:10px;
  font-weight:600; color: var(--ig-muted); border:0 !important; }
.stTabs [role="tab"] p { font-weight:600; font-size:.9rem; }
.stTabs [role="tab"][aria-selected="true"], .stTabs [data-selected="true"] {
  background: linear-gradient(135deg, rgba(139,124,255,.28), rgba(63,193,201,.16)); color: var(--ig-text) !important; }
.stTabs [role="tab"]:hover { color: var(--ig-text); background: rgba(255,255,255,.04); }
.stTabs [data-baseweb="tab-highlight"], .stTabs [data-baseweb="tab-border"] { display:none; }
.stTabs [role="tablist"] [style*="height: 2px"], .stTabs [role="tablist"] [style*="height:2px"] { display:none; }
.ig-db { font-size:.74rem; color: var(--ig-muted); word-break: break-all; margin-top:.8rem; }

/* cards, metrics, inputs */
[data-testid="stMetric"] { background: var(--ig-card); border:1px solid var(--ig-border); border-radius:14px;
  padding:14px 16px; }
[data-testid="stMetricLabel"] { color: var(--ig-muted); font-size:.78rem; }
[data-testid="stMetricValue"] { font-weight:700; letter-spacing:-.02em; }
[data-testid="stVerticalBlockBorderWrapper"] { border-radius:14px !important; }
.stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"] {
  background: linear-gradient(135deg, var(--ig-accent), #6D5BF0); border:0; font-weight:600;
  box-shadow: 0 6px 18px rgba(139,124,255,.25); }
.stButton > button { border-radius:10px; font-weight:500; }
[data-testid="stExpander"] { border-radius:12px; border:1px solid var(--ig-border); background: var(--ig-card); }
[data-testid="stFileUploaderDropzone"] { border-radius:14px; border:1.5px dashed var(--ig-border); background: var(--ig-card); }

.ig-section { font-size:1.05rem; font-weight:700; letter-spacing:-.01em; margin:18px 0 8px; display:flex;
  align-items:center; gap:8px; }
.ig-section .sub { color:var(--ig-muted); font-weight:500; font-size:.82rem; }
.ig-muted { color: var(--ig-muted); font-size:.85rem; }

/* plain-language answer card */
.ig-plain { border-radius:16px; padding:20px 22px; margin:6px 0 10px; border:1px solid rgba(52,211,153,.35);
  background: linear-gradient(180deg, rgba(52,211,153,.10), rgba(52,211,153,.03)); }
.ig-plain .lead { font-size:1.12rem; line-height:1.6; font-weight:500; }
.ig-plain ul { margin:.8rem 0 0 1.1rem; padding:0; }
.ig-plain li { margin:.25rem 0; color: var(--ig-text); }
.ig-plain .note { color: var(--ig-muted); font-size:.78rem; margin-top:.6rem; }
.ig-root { border-radius:12px; padding:12px 16px; border:1px solid var(--ig-border); background: var(--ig-card-2); }
.ig-root b { color: var(--ig-accent); }

/* live timeline */
.ig-ev { display:flex; gap:10px; align-items:flex-start; padding:9px 12px; margin:6px 0; border-radius:10px;
  background: var(--ig-card); border:1px solid var(--ig-border); border-left:3px solid var(--c, var(--ig-grey));
  font-size:.86rem; line-height:1.45; }
.ig-ev .ic { font-size:1rem; line-height:1.3; }
.ig-ev .t { font-weight:600; }
.ig-ev .d { color: var(--ig-muted); }
.ig-ev code { font-size:.75rem; background: rgba(255,255,255,.06); padding:1px 5px; border-radius:5px; }

/* pills */
.ig-pill { display:inline-block; font-size:.7rem; font-weight:700; letter-spacing:.04em; padding:2px 8px;
  border-radius:999px; border:1px solid currentColor; }

/* ask answers */
.ig-q { font-weight:700; font-size:1rem; margin-bottom:6px; }
.ig-answer { font-size:1rem; line-height:1.6; padding:12px 14px; border-radius:12px;
  background: rgba(96,165,250,.08); border:1px solid rgba(96,165,250,.25); }
.ig-answer.denied { background: rgba(248,113,113,.08); border-color: rgba(248,113,113,.3); }
.ig-grant code { font-size:.75rem; }

/* problem suggestion */
.ig-suggest { padding:10px 14px; border-radius:12px; border:1px dashed var(--ig-border); color: var(--ig-muted);
  font-size:.85rem; }
</style>
"""

COLORS = {"SUPPORTED": "var(--ig-green)", "REJECTED": "var(--ig-red)", "INCONCLUSIVE": "var(--ig-amber)",
          "TESTING": "var(--ig-blue)", "BLOCKED": "var(--ig-red)", "PROPOSED": "var(--ig-grey)"}


def inject():
    st.markdown(CSS, unsafe_allow_html=True)


def brand():
    st.markdown("""<div class="ig-brand"><div class="logo">🛡️</div><div><div class="name">InvestiGuard</div>
      <div class="tag">Least-privilege data analytics agent</div></div></div>""", unsafe_allow_html=True)


def side_label(text: str):
    st.markdown(f'<div class="ig-side-label">{escape(text)}</div>', unsafe_allow_html=True)


def hero(title: str, subtitle: str, chips: list[tuple[str, str]]):
    chip_html = "".join(f'<span class="ig-chip">{escape(k)} <b>{escape(str(v))}</b></span>' for k, v in chips)
    st.markdown(f'<div class="ig-hero"><h1>{escape(title)}</h1><p>{escape(subtitle)}</p>'
                f'<div class="ig-chips">{chip_html}</div></div>', unsafe_allow_html=True)


def section(title: str, sub: str = ""):
    s = f'<span class="sub">{escape(sub)}</span>' if sub else ""
    st.markdown(f'<div class="ig-section">{escape(title)} {s}</div>', unsafe_allow_html=True)


def pill(status: str) -> str:
    return f'<span class="ig-pill" style="color:{COLORS.get(status, "var(--ig-grey)")}">{escape(status)}</span>'


def event_html(icon: str, title: str, detail: str = "", color: str = "var(--ig-grey)") -> str:
    d = f'<div class="d">{detail}</div>' if detail else ""
    return (f'<div class="ig-ev" style="--c:{color}"><div class="ic">{icon}</div>'
            f'<div><div class="t">{title}</div>{d}</div></div>')


def plain_card(lead: str, facts: list[str]):
    items = "".join(f"<li>{escape(f)}</li>" for f in facts)
    facts_html = (f"<ul>{items}</ul><div class='note'>Key numbers are calculated directly from the data by code, "
                  "not written by the AI.</div>") if facts else ""
    st.markdown(f'<div class="ig-plain"><div class="lead">{escape(lead)}</div>{facts_html}</div>',
                unsafe_allow_html=True)
