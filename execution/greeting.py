"""Daily greeting generator — LLM-powered morning briefing for the dashboard."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic

from agents.sentiment import RedditFetcher
from agents.geopolitical import GoogleNewsFetcher

logger = logging.getLogger(__name__)

_TZ_PT = ZoneInfo("America/Los_Angeles")
_GREETING_CACHE = Path("execution/greeting_cache.json")

# ---------------------------------------------------------------------------
# Time-of-day greeting
# ---------------------------------------------------------------------------

def _time_greeting() -> str:
    hour = datetime.now(_TZ_PT).hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def _is_greeting_stale(cache: dict) -> bool:
    """True if cached greeting is from a different PT calendar day."""
    cached_date = cache.get("date", "")
    today = datetime.now(_TZ_PT).strftime("%Y-%m-%d")
    return cached_date != today


# ---------------------------------------------------------------------------
# Account leverage assessment
# ---------------------------------------------------------------------------

def _assess_leverage(stats: dict | None) -> dict:
    """Compute effective leverage and risk level from account stats."""
    if not stats or stats.get("notional") is None or stats.get("equity") in (None, 0):
        return {"effective_leverage": 0.0, "risk_level": "unknown", "detail": "No position data available."}

    notional = stats["notional"]
    equity = stats["equity"]
    effective_lev = notional / equity if equity > 0 else 0.0
    margin_pct = (stats.get("margin_used", 0) / equity * 100) if equity > 0 else 0.0

    liq_px = stats.get("liquidation_px")
    btc_price = stats.get("btc_price")
    liq_distance = None
    if liq_px and btc_price and btc_price > 0:
        liq_distance = ((btc_price - liq_px) / btc_price) * 100

    if effective_lev >= 2.5:
        risk_level = "high"
    elif effective_lev >= 1.5:
        risk_level = "elevated"
    elif effective_lev >= 0.5:
        risk_level = "moderate"
    else:
        risk_level = "low"

    detail = (
        f"Effective leverage: {effective_lev:.2f}x | "
        f"Margin utilisation: {margin_pct:.1f}% | "
        f"Position: ${notional:,.0f} on ${equity:,.0f} equity"
    )
    if liq_distance is not None:
        detail += f" | Liquidation is {liq_distance:.1f}% away"

    return {
        "effective_leverage": round(effective_lev, 2),
        "risk_level": risk_level,
        "detail": detail,
        "liq_distance": liq_distance,
        "margin_pct": round(margin_pct, 1),
    }


# ---------------------------------------------------------------------------
# News context for briefing
# ---------------------------------------------------------------------------

def _fetch_news_context() -> dict:
    """Fetch headlines and Reddit posts for the daily briefing.

    Returns a dict with compact summaries suitable for the LLM prompt.
    """
    context: dict = {}

    # Geopolitical headlines
    try:
        geo_fetcher = GoogleNewsFetcher(max_headlines=10)
        headlines = geo_fetcher.fetch([
            "bitcoin regulation", "sanctions", "banking crisis",
            "currency devaluation", "CBDC", "capital controls",
        ])
        if headlines:
            context["geopolitical_headlines"] = [
                f"[{h.source}] {h.title}" for h in headlines[:8]
            ]
    except Exception as exc:
        logger.debug("Failed to fetch geo headlines for greeting: %s", exc)

    # Reddit sentiment
    try:
        reddit_fetcher = RedditFetcher(
            subreddits=["Bitcoin", "CryptoCurrency"],
            max_posts=15,
            sort="hot",
        )
        posts = reddit_fetcher.fetch()
        if posts:
            # Top posts by score
            top = sorted(posts, key=lambda p: p.score, reverse=True)[:8]
            context["reddit_top_posts"] = [
                f"r/{p.subreddit} (score:{p.score}) {p.title}" for p in top
            ]
    except Exception as exc:
        logger.debug("Failed to fetch Reddit posts for greeting: %s", exc)

    return context


# ---------------------------------------------------------------------------
# LLM greeting
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are the BTC Bot daily briefing assistant. You speak directly to Curtis, \
the bot's operator. You are enthusiastic, energetic, and hype — like a \
trusted trading desk analyst who genuinely loves this job and is fired up \
about the market every single day. Be encouraging and positive while still \
being honest about risks.

You will receive the current account state, market context, and today's news \
headlines / Reddit sentiment. Produce a daily briefing. Structure it as:

1. An enthusiastic time-appropriate greeting using Curtis's name.
2. A quick account status summary (position, PnL, leverage). Hype up any \
gains, be supportive about losses.
3. If effective leverage is high (>2x), flag the risk but stay encouraging. \
If extreme (>3x), strongly recommend reducing exposure.
4. NEWS DIGEST — Include 1-2 line summaries for each agent's data:
   - SENTIMENT: What is the Reddit mood? Fearful, greedy, mixed? \
Mention 1-2 notable post themes.
   - GEOPOLITICAL: What are the top macro headlines affecting BTC? \
Summarize 1-2 key stories.
   - TECHNICAL: Comment on recent price action (you have BTC price data).
   - CYCLE: Where are we in the halving cycle (context: last halving \
was April 2024, next is ~2028).
5. Any relevant observation about the next scheduled buy.
6. A closing thought — keep it hype and motivating.

Do NOT use emojis. Do NOT use markdown formatting. Write plain text only. \
This appears in a text box on a dashboard."""


def _generate_greeting_llm(
    stats: dict | None,
    leverage_info: dict,
    next_buy: str,
    api_key: str,
    model: str,
    currency: str = "USD",
    ccy_rate: float = 1.0,
) -> str:
    """Call Anthropic to generate a contextual daily greeting."""
    now_pt = datetime.now(_TZ_PT)
    greeting = _time_greeting()
    ccy_sym = "C$" if currency == "CAD" else "$"

    def _convert(usd_val: float | None) -> str | None:
        if usd_val is None:
            return None
        return f"{ccy_sym}{usd_val * ccy_rate:,.2f}"

    # Fetch live news context
    news_context = _fetch_news_context()

    context = {
        "greeting": greeting,
        "name": "Curtis",
        "date": now_pt.strftime("%A, %B %d, %Y"),
        "time_pt": now_pt.strftime("%I:%M %p PT"),
        "next_scheduled_buy": next_buy,
        "leverage_assessment": leverage_info,
        "display_currency": currency,
    }

    if stats:
        context["account"] = {
            "equity": _convert(stats.get("equity")),
            "open_pnl": _convert(stats.get("open_pnl")),
            "total_pnl": _convert(stats.get("total_pnl")),
            "btc_price": _convert(stats.get("btc_price")),
            "position_notional": _convert(stats.get("notional")),
            "liquidation_price": _convert(stats.get("liquidation_px")),
            "margin_used": _convert(stats.get("margin_used")),
            "available": _convert(stats.get("available")),
        }

    if news_context:
        context["todays_news"] = news_context

    user_prompt = (
        f"Generate today's briefing for Curtis. All monetary values are shown in "
        f"{currency}. Use the {currency} symbol ({ccy_sym}) for all dollar amounts. "
        f"Here is the current state:\n\n"
        f"{json.dumps(context, indent=2, default=str)}"
    )

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=600,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return message.content[0].text.strip()
    except Exception as exc:
        logger.warning("Greeting LLM call failed: %s", exc)
        return (
            f"{greeting}, Curtis. I wasn't able to generate today's full briefing "
            f"due to a temporary issue. Your account leverage is "
            f"{leverage_info.get('risk_level', 'unknown')} "
            f"({leverage_info.get('effective_leverage', 0):.1f}x effective). "
            f"Next scheduled buy: {next_buy}. Stay sharp."
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_daily_greeting(
    stats: dict | None,
    config: dict,
    next_buy_label: str,
    currency: str = "CAD",
    ccy_rate: float = 1.0,
) -> str:
    """Return today's cached greeting, or generate a fresh one.

    Caches per PT calendar day + currency so the LLM is called at most once
    per day per currency setting.
    """
    # Check cache
    cache: dict = {}
    if _GREETING_CACHE.exists():
        try:
            cache = json.loads(_GREETING_CACHE.read_text())
        except (json.JSONDecodeError, OSError):
            cache = {}

    cache_hit = (
        not _is_greeting_stale(cache)
        and cache.get("message")
        and cache.get("currency") == currency
    )
    if cache_hit:
        return cache["message"]

    # Get API key
    anthropic_cfg = config.get("anthropic", {})
    api_key = os.getenv("ANTHROPIC_API_KEY", "") or anthropic_cfg.get("api_key", "")
    if not api_key:
        try:
            import streamlit as st
            api_key = st.secrets.get("ANTHROPIC_API_KEY", "")
        except Exception:
            pass

    model = anthropic_cfg.get("model", "claude-haiku-4-5-20251001")

    leverage_info = _assess_leverage(stats)
    message = _generate_greeting_llm(
        stats, leverage_info, next_buy_label, api_key, model,
        currency=currency, ccy_rate=ccy_rate,
    )

    # Cache it
    today = datetime.now(_TZ_PT).strftime("%Y-%m-%d")
    new_cache = {"date": today, "message": message, "currency": currency}
    try:
        _GREETING_CACHE.parent.mkdir(parents=True, exist_ok=True)
        _GREETING_CACHE.write_text(json.dumps(new_cache, indent=2))
    except OSError as exc:
        logger.warning("Could not write greeting cache: %s", exc)

    return message
