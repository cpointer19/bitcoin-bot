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
from models.signal import Signal

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(page_title="BTC DCA Bot", layout="wide")

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

        open_pnl = sum(
            float(p.get("position", {}).get("unrealizedPnl", 0))
            for p in state.get("assetPositions", [])
        )

        all_time = portfolio.get("allTime", {})
        total_pnl = float(all_time.get("pnl", 0)) if isinstance(all_time, dict) else 0
        volume = float(all_time.get("vlm", 0)) if isinstance(all_time, dict) else 0

        return {
            "equity": equity,
            "available": withdrawable,
            "margin_used": margin_used,
            "open_pnl": open_pnl,
            "total_pnl": total_pnl,
            "volume": volume,
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

base_dca = config.get("orchestrator", {}).get("base_dca_usd", 100)
st.sidebar.metric("Base DCA", f"${base_dca}")
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
st.sidebar.markdown("**Account**")
_wallet = _get_wallet_address()
if _wallet:
    _stats = fetch_account_stats(_wallet)
    if _stats:
        st.sidebar.metric("Equity", f"${_stats['equity']:,.2f}")
        st.sidebar.metric("Available", f"${_stats['available']:,.2f}")
        st.sidebar.metric("Margin Used", f"${_stats['margin_used']:,.2f}")
        st.sidebar.metric("Open PnL", f"${_stats['open_pnl']:+,.2f}")
        st.sidebar.metric("All-Time PnL", f"${_stats['total_pnl']:+,.2f}")
        st.sidebar.metric("Volume", f"${_stats['volume']:,.0f}")
    else:
        st.sidebar.warning("Could not fetch account data")
else:
    st.sidebar.info("Set HYPERLIQUID_WALLET_ADDRESS to see account stats")

st.sidebar.markdown("---")
run_now = st.sidebar.button("Run Analysis Now")

# ---------------------------------------------------------------------------
# Main content
# ---------------------------------------------------------------------------

st.title("BTC Bot")

# ---- Tab layout ----
tab_signals, tab_chart, tab_trades = st.tabs(["Signals & Decision", "Historical Chart", "Trade Log"])

# ===================================================================
# TAB 1: Current Signals & Decision
# ===================================================================

with tab_signals:
    if run_now:
        with st.spinner("Running all agents..."):
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
        st.info("Press **Run Analysis Now** in the sidebar to fetch live signals.")
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
        col_score.metric("Composite Score", f"{decision.composite_score:+.4f}")
        order_usd = base_dca * decision.dca_multiplier
        col_dca.metric("Order Size", f"${order_usd:.0f}", f"{decision.dca_multiplier:.1f}x base")

        st.markdown("---")

        # -- Individual agent signals --
        st.subheader("Agent Signals")
        for sig in decision.signals:
            with st.expander(
                f"**{sig.agent.upper()}**  |  "
                f"Score: {sig.score:+.4f}  |  "
                f"Confidence: {sig.confidence:.0%}"
            ):
                c1, c2 = st.columns(2)
                c1.markdown(f"**Score:** {sig.score:+.4f}")
                c2.markdown(f"**Confidence:** {_conf_bar(sig.confidence)}")
                st.code(sig.reasoning, language=None)

        st.markdown("---")

        # -- Execute button --
        if st.button("Execute Trade (Dry Run)"):
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
            if result.dry_run and result.amount_btc is not None:
                st.success(
                    f"[DRY RUN] Would BUY {result.amount_btc:.8f} BTC "
                    f"(${result.amount_usd:.2f}) @ ${result.price:,.2f} "
                    f"[{result.leverage}x leverage]"
                )
            elif result.executed and result.amount_btc is not None:
                st.success(
                    f"ORDER FILLED — {result.amount_btc:.8f} BTC @ ${result.price:,.2f} "
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
            subplot_titles=["BTC/USD Price", "Technical Score"],
        )

        # Price line
        fig.add_trace(
            go.Scatter(
                x=bt_df["date"], y=bt_df["close"],
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
        fig.update_yaxes(title_text="USD", row=1, col=1)
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
        c2.metric("Total Spent (USD)", f"${total_spent:,.2f}")
        c3.metric("Total BTC Accumulated", f"{total_btc:.8f}")
