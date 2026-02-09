"""Streamlit dashboard for the Bitcoin DCA bot.

Run with:
    source venv/bin/activate
    streamlit run dashboard.py
"""

from __future__ import annotations

import os
from io import StringIO

import requests as httpx
import yaml
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

from agents import SentimentAgent, GeopoliticalAgent, TechnicalAgent, CycleAgent
from agents.data_fetcher import OHLCVFetcher
from orchestrator.orchestrator import Orchestrator, Decision
from execution.executor import Executor, OrderResult
from execution.trade_log import TradeRecord, append_trade, load_trade_log
from execution.schedule import (
    load_schedule, ensure_todays_entry, mark_missed_entries,
    confirm_scheduled_buy, get_today_pt, next_pay_date,
)
from execution.greeting import get_daily_greeting
from models.signal import Signal

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(page_title="BTC DCA Bot", page_icon="🐧", layout="wide")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_config() -> dict:
    with open("config.yaml") as f:
        return yaml.safe_load(f)


_ACTION_COLORS = {
    "strong_buy": "#00c853",
    "buy": "#66bb6a",
    "normal": "#78909c",
    "reduce": "#ff7043",
    "minimal": "#d32f2f",
}

_ACTION_EMOJI = {
    "strong_buy": "Strong Buy  (3x DCA)",
    "buy": "Buy  (1.5x DCA)",
    "normal": "Normal DCA  (1x)",
    "reduce": "Reduce  (0.5x DCA)",
    "minimal": "Minimal  (0.2x DCA)",
}


def _score_color(score: float) -> str:
    if score >= 0.3:
        return "#00c853"
    if score >= 0.0:
        return "#66bb6a"
    if score >= -0.3:
        return "#ff7043"
    return "#d32f2f"


def _conf_bar(confidence: float) -> str:
    pct = int(confidence * 100)
    return f"`{'|' * (pct // 5)}{'.' * (20 - pct // 5)}` {pct}%"


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_usd_cad_rate() -> float:
    """Fetch current USD→CAD exchange rate. Falls back to 1.36 on error."""
    try:
        resp = httpx.get(
            "https://api.exchangerate-api.com/v4/latest/USD",
            timeout=5,
        )
        return float(resp.json()["rates"]["CAD"])
    except Exception:
        return 1.36


_HL_INFO_URL = "https://api.hyperliquid.xyz/info"


def _get_wallet_address() -> str:
    """Read wallet address from env or Streamlit secrets."""
    addr = os.getenv("HYPERLIQUID_WALLET_ADDRESS", "")
    if not addr:
        try:
            addr = st.secrets.get("HYPERLIQUID_WALLET_ADDRESS", "")
        except (AttributeError, FileNotFoundError):
            pass
    return addr


@st.cache_data(ttl=60, show_spinner=False)
def fetch_account_stats(wallet: str) -> dict | None:
    """Fetch basic account stats from the Hyperliquid public API."""
    try:
        state = httpx.post(
            _HL_INFO_URL,
            json={"type": "clearinghouseState", "user": wallet},
            timeout=10,
        ).json()

        portfolio = httpx.post(
            _HL_INFO_URL,
            json={"type": "portfolio", "user": wallet},
            timeout=10,
        ).json()

        margin = state.get("marginSummary", {})
        equity = float(margin.get("accountValue", 0))
        withdrawable = float(state.get("withdrawable", 0))
        margin_used = float(margin.get("totalMarginUsed", 0))

        open_pnl = 0.0
        liquidation_px = None
        notional = None
        for p in state.get("assetPositions", []):
            pos = p.get("position", {})
            open_pnl += float(pos.get("unrealizedPnl", 0))
            # Grab BTC position details
            if pos.get("coin") == "BTC" and float(pos.get("szi", 0)) != 0:
                liq = pos.get("liquidationPx")
                if liq is not None:
                    liquidation_px = float(liq)
                entry_px = float(pos.get("entryPx", 0))
                size = abs(float(pos.get("szi", 0)))
                notional = entry_px * size

        # portfolio is a list of [period_name, data] pairs
        all_time: dict = {}
        for item in portfolio:
            if isinstance(item, list) and len(item) == 2 and item[0] == "allTime":
                all_time = item[1]
                break
        pnl_history = all_time.get("pnlHistory", [])
        # PnL since Feb 8 2026 (bot birth date)
        _cutoff_ms = 1770508800000  # 2026-02-08T00:00:00Z
        if pnl_history:
            # Find cumulative PnL at the cutoff (last entry before cutoff)
            baseline = 0.0
            for ts, pnl in pnl_history:
                if ts >= _cutoff_ms:
                    break
                baseline = float(pnl)
            total_pnl = float(pnl_history[-1][1]) - baseline
        else:
            total_pnl = 0
        volume = float(all_time.get("vlm", 0))

        # Current BTC mid-price
        btc_price = None
        try:
            mids = httpx.post(
                _HL_INFO_URL,
                json={"type": "allMids"},
                timeout=10,
            ).json()
            if "BTC" in mids:
                btc_price = float(mids["BTC"])
        except Exception:
            pass

        return {
            "equity": equity,
            "available": withdrawable,
            "margin_used": margin_used,
            "open_pnl": open_pnl,
            "total_pnl": total_pnl,
            "volume": volume,
            "liquidation_px": liquidation_px,
            "notional": notional,
            "btc_price": btc_price,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Data loading (cached)
# ---------------------------------------------------------------------------

@st.cache_data(ttl=300, show_spinner="Fetching OHLCV data from Kraken...")
def fetch_price_data(symbol: str, daily_limit: int, weekly_limit: int):
    fetcher = OHLCVFetcher(symbol=symbol)
    daily = fetcher.fetch("1d", limit=daily_limit)
    weekly = fetcher.fetch("1w", limit=weekly_limit)
    return daily, weekly


@st.cache_data(ttl=300, show_spinner="Running technical backtest...")
def run_backtest(config_dict: str, daily_df_json: str, weekly_df_json: str):
    """Run the technical agent across historical data and return results as JSON."""
    config = yaml.safe_load(config_dict)
    daily_df = pd.read_json(StringIO(daily_df_json))
    daily_df.index = pd.to_datetime(daily_df.index, utc=True)
    weekly_df = pd.read_json(StringIO(weekly_df_json))
    weekly_df.index = pd.to_datetime(weekly_df.index, utc=True)

    agent = TechnicalAgent(config)
    start_idx = 250
    rows = []
    for i in range(start_idx, len(daily_df)):
        day = daily_df.index[i]
        daily_slice = daily_df.iloc[: i + 1]
        weekly_slice = weekly_df[weekly_df.index <= day]
        if weekly_slice.empty:
            continue
        sig = agent.score_at(daily_slice, weekly_slice)
        rows.append({
            "date": day,
            "score": sig.score,
            "confidence": sig.confidence,
            "close": daily_df.iloc[i]["close"],
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

st.sidebar.title("BTC DCA Bot")
config = load_config()

# Currency toggle (CAD default)
_ccy_choice = st.sidebar.toggle("Show in CAD", value=True, key="ccy_toggle")
_ccy = "CAD" if _ccy_choice else "USD"
_ccy_rate = _fetch_usd_cad_rate() if _ccy == "CAD" else 1.0
_ccy_sym = "C$" if _ccy == "CAD" else "$"


def _fmt(usd_val: float, decimals: int = 2, sign: bool = False) -> str:
    """Format a USD value in the selected display currency."""
    converted = usd_val * _ccy_rate
    if sign:
        return f"{_ccy_sym}{converted:+,.{decimals}f}"
    return f"{_ccy_sym}{converted:,.{decimals}f}"


st.sidebar.markdown("---")
_base_dca_cad = config.get("orchestrator", {}).get("base_dca_cad", 200)
_cad_rate = _fetch_usd_cad_rate()
base_dca = _base_dca_cad / _cad_rate  # Convert CAD config to USD for orders
st.sidebar.metric("Base DCA", f"C${_base_dca_cad:.0f}" if _ccy == "CAD" else _fmt(base_dca, decimals=0))
st.sidebar.metric("Dry Run", "ON" if config.get("trading", {}).get("dry_run", True) else "OFF")
st.sidebar.metric("Kill Switch", "ON" if config.get("trading", {}).get("kill_switch", False) else "OFF")
st.sidebar.metric("Leverage", f"{config.get('trading', {}).get('leverage', 1)}x")

st.sidebar.markdown("---")
st.sidebar.markdown("**Agent Weights**")
agents_cfg = config.get("agents", {})
total_w = sum(a.get("weight", 0) for a in agents_cfg.values())
for name, acfg in agents_cfg.items():
    w = acfg.get("weight", 0) / total_w * 100 if total_w else 0
    st.sidebar.text(f"  {name:<15} {w:.0f}%")

st.sidebar.markdown("---")
st.sidebar.markdown("[GitHub Repo](https://github.com/cpointer19/bitcoin-bot)")

# ---------------------------------------------------------------------------
# Main content
# ---------------------------------------------------------------------------

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    /* ── Global ── */
    html, body, .stApp, [data-testid="stAppViewContainer"] {
        font-family: "JetBrains Mono", "Fira Code", "Courier New", monospace !important;
    }
    .stApp {
        background-color: #0a0a0f !important;
    }
    hr {
        border-color: #1a1a25 !important;
        box-shadow: 0 0 6px #f7931a11;
    }

    /* ── Title glow ── */
    .stApp h1 {
        color: #f7931a !important;
        text-shadow: 0 0 20px #f7931a44, 0 0 40px #f7931a22;
        letter-spacing: 0.05em;
    }

    /* ── Sidebar ── */
    [data-testid="stSidebar"] {
        background-color: #08080d !important;
        border-right: 1px solid #f7931a33 !important;
    }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 {
        color: #f7931a !important;
    }
    [data-testid="stSidebar"] .stMarkdown p strong {
        color: #f7931a99 !important;
    }
    [data-testid="stSidebar"] a {
        color: #f7931a !important;
        text-decoration: none;
    }
    [data-testid="stSidebar"] a:hover {
        text-shadow: 0 0 8px #f7931a66;
    }

    /* ── Metric cards ── */
    [data-testid="stMetric"] {
        background: #111118 !important;
        border: 1px solid #1a1a25 !important;
        border-top: 2px solid #f7931a33 !important;
        border-radius: 6px !important;
        padding: 0.8rem 1rem !important;
    }
    [data-testid="stMetric"] label {
        color: #666 !important;
        text-transform: uppercase;
        font-size: 0.7rem !important;
        letter-spacing: 0.08em;
    }
    [data-testid="stMetric"] [data-testid="stMetricValue"] {
        color: #e0e0e0 !important;
    }
    [data-testid="stMetric"] [data-testid="stMetricDelta"] {
        color: #f7931a !important;
    }

    /* ── Primary button (Run Analysis) ── */
    button[kind="primary"] {
        background: transparent !important;
        border: 1px solid #f7931a !important;
        color: #f7931a !important;
        font-size: 1.05rem !important;
        font-weight: 600 !important;
        font-family: "JetBrains Mono", monospace !important;
        text-transform: uppercase !important;
        letter-spacing: 0.12em !important;
        padding: 0.7rem 1.4rem !important;
        min-height: 3rem !important;
        transition: all 0.3s ease !important;
    }
    button[kind="primary"]:hover {
        background: #f7931a18 !important;
        box-shadow: 0 0 20px #f7931a44, 0 0 40px #f7931a22 !important;
        border-color: #f7931a !important;
    }

    /* ── Secondary buttons (Execute Trade, Hide/Show) ── */
    button[kind="secondary"] {
        background: transparent !important;
        border: 1px solid #2a2d35 !important;
        color: #c0c8d0 !important;
        font-family: "JetBrains Mono", monospace !important;
        text-transform: uppercase !important;
        letter-spacing: 0.08em !important;
        font-size: 0.85rem !important;
        transition: all 0.3s ease !important;
    }
    button[kind="secondary"]:hover {
        border-color: #f7931a66 !important;
        box-shadow: 0 0 12px #f7931a22 !important;
        color: #f7931a !important;
    }

    /* ── Tabs ── */
    .stTabs [data-baseweb="tab-list"] {
        border-bottom: 1px solid #1a1a25 !important;
        gap: 0 !important;
    }
    .stTabs [data-baseweb="tab-list"] button {
        font-family: "JetBrains Mono", monospace !important;
        font-size: 1.05rem !important;
        font-weight: 500 !important;
        color: #555 !important;
        padding: 0.7rem 1.2rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.06em !important;
        border-bottom: 2px solid transparent !important;
        transition: all 0.2s ease !important;
    }
    .stTabs [data-baseweb="tab-list"] button:hover {
        color: #f7931a99 !important;
    }
    .stTabs [data-baseweb="tab-list"] button[aria-selected="true"] {
        font-size: 1.2rem !important;
        font-weight: 700 !important;
        color: #f7931a !important;
        border-bottom: 2px solid #f7931a !important;
        text-shadow: 0 0 10px #f7931a33;
    }

    /* ── Expanders ── */
    [data-testid="stExpander"] {
        border: 1px solid #1a1a25 !important;
        border-radius: 6px !important;
        background: #0d0d14 !important;
        transition: border-color 0.2s ease;
    }
    [data-testid="stExpander"]:hover {
        border-color: #f7931a44 !important;
    }
    [data-testid="stExpander"] summary {
        font-family: "JetBrains Mono", monospace !important;
        font-weight: 600 !important;
        font-size: 0.95rem !important;
        letter-spacing: 0.02em !important;
    }
    /* Hide the duplicate shadow span Streamlit uses for sizing */
    [data-testid="stExpander"] summary span[style*="absolute"] {
        display: none !important;
    }

    /* ── Text inputs ── */
    .stTextInput input {
        background: #0d0d14 !important;
        border: 1px solid #1a1a25 !important;
        color: #c0c8d0 !important;
        font-family: "JetBrains Mono", monospace !important;
    }
    .stTextInput input:focus {
        border-color: #f7931a !important;
        box-shadow: 0 0 8px #f7931a33 !important;
    }

    /* ── Dataframes ── */
    .stDataFrame {
        border: 1px solid #1a1a25 !important;
        border-radius: 6px !important;
    }

    /* ── Alert boxes (info, warning, success, error) ── */
    [data-testid="stAlert"] {
        background: #0d0d14 !important;
        border-radius: 4px !important;
    }

    /* ── Subheaders ── */
    h2, h3 {
        color: #c0c8d0 !important;
        letter-spacing: 0.04em;
    }

    /* ── Captions ── */
    .stCaption, small {
        color: #555 !important;
    }

    /* ── Markdown links ── */
    a {
        color: #f7931a !important;
    }

    /* ── Spinner ── */
    .stSpinner > div {
        border-top-color: #f7931a !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)
_title_col, _eye_col, _btn_col = st.columns([3, 0.4, 1])
_title_col.title("BTC Bot")
if "hide_values" not in st.session_state:
    st.session_state["hide_values"] = False
_eye_label = "Hide" if not st.session_state["hide_values"] else "Show"
if _eye_col.button(_eye_label, key="eye_toggle", use_container_width=True):
    st.session_state["hide_values"] = not st.session_state["hide_values"]
    st.rerun()
_hidden = st.session_state["hide_values"]
_mask = "••••"
run_now = _btn_col.button("Run Analysis Now", type="primary", use_container_width=True)

# ---------------------------------------------------------------------------
# Account overview (top of page)
# ---------------------------------------------------------------------------

_wallet = _get_wallet_address()
if _wallet:
    _stats = fetch_account_stats(_wallet)
    if _stats:
        def _v(fmt: str) -> str:
            """Return formatted value or mask."""
            return _mask if _hidden else fmt

        # Row 1: position & PnL
        _r1 = st.columns(4)
        if _stats["notional"] is not None:
            _r1[0].metric("Position Value", _v(_fmt(_stats['notional'])))
        else:
            _r1[0].metric("Position Value", "—", help="No open BTC position")
        _r1[1].metric("Open PnL", _v(_fmt(_stats['open_pnl'], sign=True)))
        _r1[2].metric(
            "All-Time PnL",
            _v(_fmt(_stats['total_pnl'], sign=True)),
            help="Cumulative PnL since Feb 8, 2026 — the day this bot was born",
        )
        if _stats["liquidation_px"] is not None:
            _r1[3].metric("Liq. Price", _v(_fmt(_stats['liquidation_px'], decimals=0)))
        else:
            _r1[3].metric("Liq. Price", "—", help="No open BTC position")
        # Row 2: price & account details
        _r2 = st.columns(4)
        if _stats["btc_price"] is not None:
            _r2[0].metric("BTC Price", _fmt(_stats['btc_price']))  # price is public, never masked
        else:
            _r2[0].metric("BTC Price", "—")
        _r2[1].metric("Equity", _v(_fmt(_stats['equity'])))
        _r2[2].metric("Available", _v(_fmt(_stats['available'])))
        _r2[3].metric("Margin Used", _v(_fmt(_stats['margin_used'])))
        st.markdown("---")

# ---- Daily briefing from the bot ----
_next_buy_label = next_pay_date().strftime("%b %d, %Y")
_greeting_stats = locals().get("_stats") if _wallet else None
_greeting_msg = get_daily_greeting(
    stats=_greeting_stats,
    config=config,
    next_buy_label=_next_buy_label,
    currency=_ccy,
    ccy_rate=_ccy_rate,
)
st.markdown(
    "<div style='"
    "background: #0a0a0f; "
    "border-left: 3px solid #f7931a; "
    "border-top: 1px solid #f7931a22; "
    "border-right: 1px solid #1a1a25; "
    "border-bottom: 1px solid #1a1a25; "
    "border-radius: 4px; "
    "padding: 1.2rem 1.5rem; "
    "font-family: \"JetBrains Mono\", monospace; "
    "font-size: 0.95rem; "
    "line-height: 1.8; "
    "color: #c0c8d0; "
    "white-space: pre-wrap; "
    "margin-bottom: 1rem;"
    f"'>{_greeting_msg}</div>",
    unsafe_allow_html=True,
)

# ---- Schedule ledger: auto-generate today's entry & mark stale as missed ----
mark_missed_entries()
ensure_todays_entry(base_dca_usd=base_dca)

# ---- Tab layout ----
tab_signals, tab_strategy, tab_chart, tab_trades, tab_schedule = st.tabs(
    ["Signals & Decision", "Strategy", "Historical Chart", "Trade Log", "Scheduled Buys"]
)

# ===================================================================
# TAB 1: Current Signals & Decision
# ===================================================================

with tab_signals:
    if run_now:
        with st.spinner("Running all agents..."):
            # Inject the USD-converted base DCA so the orchestrator uses it
            config.setdefault("orchestrator", {})["base_dca_usd"] = base_dca
            agent_instances = [
                SentimentAgent(config),
                GeopoliticalAgent(config),
                TechnicalAgent(config),
                CycleAgent(config),
            ]
            orch = Orchestrator(agent_instances, config)
            decision = orch.decide()

        st.session_state["decision"] = decision

    decision: Decision | None = st.session_state.get("decision")

    if decision is None:
        st.info("Press **Run Analysis Now** above to fetch live signals.")
    else:
        # -- Composite signal --
        col_action, col_score, col_dca = st.columns(3)
        action_label = _ACTION_EMOJI.get(decision.action, decision.action)
        action_color = _ACTION_COLORS.get(decision.action, "#78909c")

        col_action.markdown(
            f"### Recommended Action\n"
            f"<span style='color:{action_color}; font-size:1.4em; font-weight:bold'>"
            f"{action_label}</span>",
            unsafe_allow_html=True,
        )
        col_score.metric(
            "Composite Score*",
            f"{decision.composite_score:+.4f}",
        )
        order_usd = base_dca * decision.dca_multiplier
        col_dca.metric("Order Size", _fmt(order_usd, decimals=0), f"{decision.dca_multiplier:.1f}x base")

        st.markdown(
            "<div style='font-size:0.9rem; line-height:1.6; color:#aaa; margin-top:0.8rem;'>"
            "<b>*Composite Score</b> — Each agent produces a score from "
            "<b>-1.0</b> to <b>+1.0</b>:<br>"
            "+1.0 = strongest bullish signal (buy more BTC) · "
            "0.0 = neutral · "
            "-1.0 = strongest bearish signal (buy less BTC)<br><br>"
            "<b>Technical:</b> +1 = oversold / bullish crossovers, "
            "-1 = overbought / bearish crossovers<br>"
            "<b>Cycle:</b> +1 = early in halving cycle / undervalued MVRV, "
            "-1 = late cycle / overheated<br>"
            "<b>Sentiment:</b> +1 = extreme fear on Reddit (contrarian buy), "
            "-1 = extreme greed (contrarian sell)<br>"
            "<b>Geopolitical:</b> +1 = macro favors BTC (banking crisis, capital controls), "
            "-1 = hostile (crackdowns, hawkish central banks)"
            "</div>",
            unsafe_allow_html=True,
        )

        st.markdown("---")

        # -- Individual agent signals --
        st.subheader("Agent Signals")
        for sig in decision.signals:
            with st.expander(
                f"{sig.agent.upper()}  |  "
                f"Score: {sig.score:+.4f}  |  "
                f"Confidence: {sig.confidence:.0%}"
            ):
                c1, c2 = st.columns(2)
                c1.markdown(f"**Score:** {sig.score:+.4f}")
                c2.markdown(f"**Confidence:** {_conf_bar(sig.confidence)}")
                st.markdown(
                    f'<div style="white-space:pre-wrap; word-wrap:break-word; '
                    f'font-size:1.05rem; line-height:1.6;">{sig.reasoning}</div>',
                    unsafe_allow_html=True,
                )

        st.markdown("---")

        # -- Execute button (password-protected) --
        _TRADE_PW_HASH = "ef4849eb661ec448f9d3aeb3a7f013d04aa3f31a7717a31c74426790c93c2a3e"
        _trade_pw = st.text_input("Trade password", type="password", key="trade_pw")
        _exec_clicked = st.button("Execute Trade")
        if _exec_clicked:
            import hashlib
            if hashlib.sha256(_trade_pw.encode()).hexdigest() != _TRADE_PW_HASH:
                st.error("Incorrect password.")
                st.stop()
            with st.spinner("Executing..."):
                executor = Executor(config)
                executor.connect()
                result = executor.execute(
                    action=decision.action,
                    amount_usd=order_usd,
                )
                append_trade(TradeRecord(
                    timestamp=decision.timestamp.isoformat(),
                    action=decision.action,
                    dca_multiplier=decision.dca_multiplier,
                    composite_score=decision.composite_score,
                    amount_usd=result.amount_usd,
                    amount_btc=result.amount_btc,
                    price=result.price,
                    leverage=result.leverage,
                    executed=result.executed,
                    dry_run=result.dry_run,
                    reason=result.reason,
                ))
                confirm_scheduled_buy(
                    trade_date=get_today_pt(),
                    result=result,
                    decision=decision,
                )
            if result.dry_run and result.amount_btc is not None:
                st.success(
                    f"[DRY RUN] Would BUY {result.amount_btc:.8f} BTC "
                    f"({_fmt(result.amount_usd)}) @ {_fmt(result.price)} "
                    f"[{result.leverage}x leverage]"
                )
            elif result.executed and result.amount_btc is not None:
                st.success(
                    f"ORDER FILLED — {result.amount_btc:.8f} BTC @ {_fmt(result.price)} "
                    f"[{result.leverage}x leverage]"
                )
            else:
                st.error(f"Order blocked: {result.reason}")

# ===================================================================
# TAB 2: Historical Chart
# ===================================================================

with tab_chart:
    st.subheader("Technical Score vs BTC Price")

    tech_cfg = agents_cfg.get("technical", {})
    symbol = tech_cfg.get("symbol", "BTC/USD")

    with st.spinner("Loading price data..."):
        daily_df, weekly_df = fetch_price_data(symbol, 980, 200)

    bt_df = run_backtest(
        yaml.dump(config),
        daily_df.to_json(),
        weekly_df.to_json(),
    )

    if bt_df.empty:
        st.warning("Not enough data for backtest.")
    else:
        fig = make_subplots(
            rows=2, cols=1,
            shared_xaxes=True,
            vertical_spacing=0.06,
            row_heights=[0.65, 0.35],
            subplot_titles=[f"BTC/{_ccy} Price", "Technical Score"],
        )

        # Price line (convert to display currency)
        _chart_prices = bt_df["close"] * _ccy_rate
        fig.add_trace(
            go.Scatter(
                x=bt_df["date"], y=_chart_prices,
                name="BTC Price",
                line=dict(color="#f7931a", width=2),
            ),
            row=1, col=1,
        )

        # Score as filled area
        colors = ["#00c853" if s >= 0 else "#d32f2f" for s in bt_df["score"]]
        fig.add_trace(
            go.Bar(
                x=bt_df["date"], y=bt_df["score"],
                name="Tech Score",
                marker_color=colors,
                opacity=0.7,
            ),
            row=2, col=1,
        )

        # Threshold lines
        for thresh, dash in [(0.5, "dash"), (0.2, "dot"), (-0.2, "dot"), (-0.5, "dash")]:
            fig.add_hline(
                y=thresh, row=2, col=1,
                line_dash=dash, line_color="gray", line_width=1,
                annotation_text=f"{thresh:+.1f}" if abs(thresh) == 0.5 else None,
            )

        fig.update_layout(
            height=700,
            template="plotly_dark",
            showlegend=True,
            legend=dict(orientation="h", y=1.02, x=0.5, xanchor="center"),
            margin=dict(l=60, r=30, t=50, b=30),
        )
        fig.update_yaxes(title_text=_ccy, row=1, col=1)
        fig.update_yaxes(title_text="Score", range=[-1.1, 1.1], row=2, col=1)

        st.plotly_chart(fig, use_container_width=True)

        # Summary stats
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Days Scored", len(bt_df))
        c2.metric("Avg Score", f"{bt_df['score'].mean():+.4f}")
        c3.metric("Max Score", f"{bt_df['score'].max():+.4f}")
        c4.metric("Min Score", f"{bt_df['score'].min():+.4f}")

# ===================================================================
# TAB 3: Trade Log
# ===================================================================

with tab_trades:
    st.subheader("Trade History")

    history = load_trade_log()

    if not history:
        st.info("No trades recorded yet. Run an analysis and execute a trade to see entries here.")
    else:
        df = pd.DataFrame(history)
        # Format display
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, format="mixed").dt.strftime("%Y-%m-%d %H:%M")
        col_order = [
            "timestamp", "action", "dca_multiplier", "composite_score",
            "amount_usd", "amount_btc", "price", "leverage",
            "executed", "dry_run", "reason",
        ]
        df = df[[c for c in col_order if c in df.columns]]

        # Color-code the action column
        st.dataframe(
            df.style.applymap(
                lambda v: f"color: {_ACTION_COLORS.get(v, 'white')}",
                subset=["action"],
            ),
            use_container_width=True,
            height=400,
        )

        # Summary
        st.markdown("---")
        c1, c2, c3 = st.columns(3)
        total_spent = df["amount_usd"].sum()
        total_btc = df["amount_btc"].dropna().sum()
        c1.metric("Total Trades", len(df))
        c2.metric(f"Total Spent ({_ccy})", _fmt(total_spent))
        c3.metric("Total BTC Accumulated", f"{total_btc:.8f}")

# ===================================================================
# TAB 4: Scheduled Buys
# ===================================================================

with tab_schedule:
    st.subheader("Payday Buy Schedule")
    st.caption("Buys scheduled on the 15th and last day of each month (9:00 AM PT). Next buy: "
               f"**{next_pay_date().strftime('%b %d, %Y')}**")

    _schedule = load_schedule()

    if not _schedule:
        st.info("No scheduled buys yet. The first entry will appear on Feb 15, 2026 after 9:00 AM PT.")
    else:
        _schedule_sorted = sorted(_schedule, key=lambda e: e["date"], reverse=True)
        _schedule_display = _schedule_sorted[:30]

        for _entry in _schedule_display:
            _is_today = _entry["date"] == get_today_pt()
            _date_label = f"**{_entry['date']}**" + (" (Today)" if _is_today else "")

            _col_date, _col_status, _col_amount = st.columns([2, 1.5, 2])
            _col_date.markdown(_date_label)

            if _entry["status"] == "pending":
                _col_status.warning("Pending")
            elif _entry["status"] == "missed":
                _col_status.error("Missed")
            else:
                _col_status.success("Confirmed")

            _col_amount.markdown(f"Planned: **{_fmt(_entry['planned_amount_usd'], decimals=0)}**")

            if _entry["status"] == "confirmed":
                _d1, _d2, _d3, _d4 = st.columns(4)
                _d1.metric(f"Actual {_ccy}", _fmt(_entry.get('actual_amount_usd', 0)))
                _d2.metric("BTC", f"{_entry.get('actual_amount_btc', 0):.8f}")
                _d3.metric("Price", _fmt(_entry.get('price', 0)))
                _action_lbl = _ACTION_EMOJI.get(
                    _entry.get("action", ""), _entry.get("action", "—")
                )
                _d4.metric("Action", _action_lbl)
                if _entry.get("dry_run"):
                    st.caption("(Dry run)")

            st.markdown("---")

        # Summary
        _confirmed = [e for e in _schedule if e["status"] == "confirmed"]
        _pending = [e for e in _schedule if e["status"] == "pending"]
        _missed = [e for e in _schedule if e["status"] == "missed"]

        _s1, _s2, _s3, _s4 = st.columns(4)
        _s1.metric("Total Pay Dates", len(_schedule))
        _s2.metric("Confirmed", len(_confirmed))
        _s3.metric("Pending", len(_pending))
        _s4.metric("Missed", len(_missed))

        if _confirmed:
            _total_dca_spent = sum(e.get("actual_amount_usd", 0) or 0 for e in _confirmed)
            _total_dca_btc = sum(e.get("actual_amount_btc", 0) or 0 for e in _confirmed)
            _s5, _s6 = st.columns(2)
            _s5.metric("Total DCA Spent", _fmt(_total_dca_spent))
            _s6.metric("Total BTC via DCA", f"{_total_dca_btc:.8f}")

# ===================================================================
# TAB 5: Strategy
# ===================================================================

with tab_strategy:
    st.subheader("Strategy Overview")

    st.markdown(
        "Four independent agents each analyze a different dimension of the Bitcoin market "
        "and produce a **score** (-1 to +1) with a **confidence** (0 to 1). The orchestrator "
        "blends these into a single composite score using confidence-weighted averaging, then "
        "maps the result to a DCA multiplier that scales the base order size."
    )

    # Visual diagram using Streamlit's built-in graphviz support
    st.graphviz_chart("""
    digraph {
        rankdir=LR
        bgcolor="transparent"
        node [shape=box style="rounded,filled" fontname="Helvetica" fontsize=12 color="#2a2d35"]
        edge [color="#555" fontname="Helvetica" fontsize=10]

        reddit   [label="Reddit Posts"        fillcolor="#1a1a2e" fontcolor="#c9d1d9"]
        news     [label="Google News RSS"     fillcolor="#1a1a2e" fontcolor="#c9d1d9"]
        kraken   [label="Kraken OHLCV"        fillcolor="#1a1a2e" fontcolor="#c9d1d9"]
        onchain  [label="Halving + MVRV"      fillcolor="#1a1a2e" fontcolor="#c9d1d9"]

        sent     [label="Sentiment\\n25%" fillcolor="#16213e" fontcolor="#66bb6a"]
        geo      [label="Geopolitical\\n15%"   fillcolor="#16213e" fontcolor="#66bb6a"]
        tech     [label="Technical\\n30%"      fillcolor="#16213e" fontcolor="#66bb6a"]
        cycle    [label="Cycle\\n30%"          fillcolor="#16213e" fontcolor="#66bb6a"]

        orch     [label="Orchestrator"   fillcolor="#0f3460" fontcolor="#f7931a" penwidth=2]
        exec     [label="Hyperliquid\\n3x Leveraged Perps" fillcolor="#1a1a2e" fontcolor="#f7931a"]

        reddit  -> sent
        news    -> geo
        kraken  -> tech
        onchain -> cycle

        sent  -> orch
        geo   -> orch
        tech  -> orch
        cycle -> orch

        orch -> exec [label=" DCA multiplier"]
    }
    """)

    st.markdown("---")

    st.markdown(
        "**Sentiment** inverts Reddit mood as a contrarian signal -- fear is a buy signal, "
        "greed is a sell signal. **Technical** combines RSI, SMA crossover, and MACD across "
        "daily and weekly timeframes. **Cycle** blends halving-cycle position with the MVRV "
        "Z-Score to gauge market valuation. **Geopolitical** scores macro headlines for events "
        "that historically drive BTC capital flows."
    )

    st.markdown(
        "| Composite Score | Action | Multiplier |\n"
        "|---|---|---|\n"
        "| >= +0.5 | Strong Buy | 3.0x |\n"
        "| >= +0.2 | Buy | 1.5x |\n"
        "| -0.2 to +0.2 | Normal | 1.0x |\n"
        "| <= -0.2 | Reduce | 0.5x |\n"
        "| <= -0.5 | Minimal | 0.2x |"
    )
