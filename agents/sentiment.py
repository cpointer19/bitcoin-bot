"""Sentiment agent — Reddit posts → Anthropic LLM scoring → contrarian signal."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import anthropic
import numpy as np
import requests

try:
    from dotenv import load_dotenv
    from pathlib import Path
    # Resolve .env relative to project root (parent of agents/)
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except ImportError:
    pass

from models.signal import Signal
from .base import BaseAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

class _RateLimiter:
    """Simple token-bucket style limiter: at most *max_calls* per *period* seconds."""

    def __init__(self, max_calls: int, period: float) -> None:
        self.max_calls = max_calls
        self.period = period
        self._timestamps: list[float] = []

    def wait(self) -> None:
        now = time.monotonic()
        # Purge calls outside the window.
        self._timestamps = [t for t in self._timestamps if now - t < self.period]
        if len(self._timestamps) >= self.max_calls:
            sleep_for = self.period - (now - self._timestamps[0])
            if sleep_for > 0:
                logger.info("Rate limit reached — sleeping %.1fs", sleep_for)
                time.sleep(sleep_for)
        self._timestamps.append(time.monotonic())


# ---------------------------------------------------------------------------
# Reddit fetcher (active data source)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RedditPost:
    subreddit: str
    author: str
    title: str
    selftext: str
    created_utc: str
    score: int
    num_comments: int


class RedditFetcher:
    """Fetch recent posts from Bitcoin subreddits via Reddit's public JSON API."""

    _USER_AGENT = "bitcoin-bot/1.0 (sentiment analysis)"

    def __init__(self, subreddits: list[str], max_posts: int = 50, sort: str = "hot") -> None:
        self._subreddits = subreddits
        self._max_posts = max_posts
        self._sort = sort
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": self._USER_AGENT})

    def fetch(self) -> list[RedditPost]:
        """Fetch posts from all configured subreddits."""
        posts: list[RedditPost] = []
        per_sub = max(self._max_posts // len(self._subreddits), 10)

        for sub in self._subreddits:
            try:
                url = f"https://www.reddit.com/r/{sub}/{self._sort}.json"
                resp = self._session.get(
                    url,
                    params={"limit": per_sub, "raw_json": 1},
                    timeout=10,
                )
                resp.raise_for_status()
                data = resp.json()

                for child in data.get("data", {}).get("children", []):
                    p = child.get("data", {})
                    if p.get("stickied"):
                        continue
                    created = datetime.fromtimestamp(
                        p.get("created_utc", 0), tz=timezone.utc
                    ).isoformat()
                    posts.append(RedditPost(
                        subreddit=sub,
                        author=p.get("author", "[deleted]"),
                        title=p.get("title", ""),
                        selftext=(p.get("selftext") or "")[:500],
                        created_utc=created,
                        score=p.get("score", 0),
                        num_comments=p.get("num_comments", 0),
                    ))
                # Respect Reddit rate limit: 1 req/sec for unauthenticated
                time.sleep(1.0)
            except (requests.RequestException, ValueError, KeyError) as exc:
                logger.warning("Reddit fetch failed for r/%s: %s", sub, exc)

        return posts


# ---------------------------------------------------------------------------
# Twitter fetcher (disabled — requires Basic plan $200/mo)
# TODO: Re-enable Twitter when API budget permits.
# ---------------------------------------------------------------------------
#
# import tweepy
#
# @dataclass(frozen=True)
# class Tweet:
#     author: str
#     text: str
#     created_at: str
#
#
# class TwitterFetcher:
#     """Fetch recent tweets matching accounts + hashtags via Twitter API v2."""
#
#     def __init__(self, bearer_token: str, max_results: int = 50) -> None:
#         self._client = tweepy.Client(bearer_token=bearer_token, wait_on_rate_limit=True)
#         self._max_results = min(max_results, 100)
#
#     def search(self, accounts: list[str], hashtags: list[str]) -> list[Tweet]:
#         """Build a query from accounts and hashtags, return recent tweets."""
#         parts: list[str] = []
#         for acct in accounts:
#             handle = acct.lstrip("@")
#             parts.append(f"from:{handle}")
#         for tag in hashtags:
#             tag = tag.lstrip("#")
#             parts.append(f"#{tag}")
#         if not parts:
#             return []
#
#         query = f"({' OR '.join(parts)}) -is:retweet lang:en"
#         if len(query) > 512:
#             query = query[:512]
#
#         tweets: list[Tweet] = []
#         try:
#             resp = self._client.search_recent_tweets(
#                 query=query,
#                 max_results=self._max_results,
#                 tweet_fields=["author_id", "created_at", "text"],
#                 expansions=["author_id"],
#                 user_fields=["username"],
#             )
#             if resp.data is None:
#                 return []
#
#             user_map: dict[str, str] = {}
#             if resp.includes and "users" in resp.includes:
#                 for user in resp.includes["users"]:
#                     user_map[str(user.id)] = user.username
#
#             for tw in resp.data:
#                 tweets.append(Tweet(
#                     author=user_map.get(str(tw.author_id), "unknown"),
#                     text=tw.text,
#                     created_at=str(tw.created_at or ""),
#                 ))
#         except tweepy.TweepyException as exc:
#             logger.warning("Twitter search failed: %s", exc)
#
#         return tweets


# ---------------------------------------------------------------------------
# LLM scorer
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a Bitcoin market sentiment analyst. You will be given a batch of recent \
Reddit posts from Bitcoin-related subreddits. Assess the overall market sentiment \
expressed in these posts.

Return ONLY valid JSON with exactly these fields:
{
  "sentiment": <float from -1.0 (extreme fear) to 1.0 (extreme greed)>,
  "confidence": <float from 0.0 to 1.0 indicating how confident you are>,
  "reasoning": "<1-2 sentence summary of the sentiment you detected>"
}

Guidelines:
- Extreme fear/panic selling language → sentiment near -1.0
- Cautious/worried tone → sentiment -0.3 to -0.7
- Neutral/mixed → sentiment near 0.0
- Optimistic/bullish → sentiment +0.3 to +0.7
- Euphoria/FOMO/moon language → sentiment near +1.0
- If posts are few or uninformative, set confidence low (0.2-0.4)
- Weight highly-upvoted posts more heavily than low-score posts
- Consider both post titles and body text for sentiment cues"""


@dataclass(frozen=True)
class LLMSentiment:
    sentiment: float   # -1 (fear) … +1 (greed)
    confidence: float  # 0 … 1
    reasoning: str


def _score_via_llm(
    posts: list[RedditPost],
    api_key: str,
    model: str,
    rate_limiter: _RateLimiter,
) -> LLMSentiment:
    """Send Reddit posts to Anthropic Claude and parse a sentiment score."""
    post_block = "\n\n".join(
        (
            f"r/{p.subreddit} | u/{p.author} | score:{p.score} | comments:{p.num_comments} | {p.created_utc}\n"
            f"{p.title}\n{p.selftext}"
        )
        if p.selftext else (
            f"r/{p.subreddit} | u/{p.author} | score:{p.score} | comments:{p.num_comments} | {p.created_utc}\n"
            f"{p.title}"
        )
        for p in posts
    )
    user_prompt = (
        f"Here are {len(posts)} recent Bitcoin-related Reddit posts:\n\n"
        f"{post_block}\n\n"
        "Analyse the overall sentiment and return JSON."
    )

    rate_limiter.wait()
    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model=model,
            max_tokens=256,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown fences if present.
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]
            raw = raw.strip()
        data = json.loads(raw)
        return LLMSentiment(
            sentiment=float(np.clip(data["sentiment"], -1.0, 1.0)),
            confidence=float(np.clip(data["confidence"], 0.0, 1.0)),
            reasoning=data.get("reasoning", ""),
        )
    except (json.JSONDecodeError, KeyError, anthropic.APIError) as exc:
        logger.warning("LLM scoring failed: %s", exc)
        return LLMSentiment(sentiment=0.0, confidence=0.1, reasoning=f"LLM error: {exc}")


# ---------------------------------------------------------------------------
# Contrarian mapping
# ---------------------------------------------------------------------------

def _contrarian_score(sentiment: float) -> float:
    """Apply contrarian logic: extreme fear → bullish, extreme greed → bearish.

    Mapping (piecewise linear):
        sentiment -1.0 (extreme fear)  → signal +0.8  (strong buy)
        sentiment -0.5                 → signal +0.4
        sentiment  0.0 (neutral)       → signal  0.0
        sentiment +0.5                 → signal -0.4
        sentiment +1.0 (extreme greed) → signal -0.8  (strong sell)
    """
    return float(np.clip(-0.8 * sentiment, -1.0, 1.0))


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class SentimentAgent(BaseAgent):
    """Gauges market sentiment from Reddit via LLM analysis with contrarian logic."""

    name = "sentiment"

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        sent_cfg = config.get("agents", {}).get("sentiment", {})

        # Reddit config (public JSON API — no credentials needed).
        self._subreddits: list[str] = sent_cfg.get("subreddits", [
            "Bitcoin", "CryptoCurrency", "BitcoinMarkets",
        ])
        self._max_posts: int = sent_cfg.get("max_posts", 50)
        self._sort: str = sent_cfg.get("sort", "hot")

        # Anthropic config — prefer env var, fall back to config, then Streamlit secrets.
        anthropic_cfg = config.get("anthropic", {})
        self._api_key: str = (
            os.getenv("ANTHROPIC_API_KEY", "")
            or anthropic_cfg.get("api_key", "")
        )
        if not self._api_key:
            try:
                import streamlit as st
                self._api_key = st.secrets["ANTHROPIC_API_KEY"]
            except Exception:
                pass
        self._model: str = anthropic_cfg.get("model", "claude-haiku-4-5-20251001")

        # Rate limiting: default 10 LLM calls per 60s.
        rl_cfg = sent_cfg.get("rate_limit", {})
        self._rate_limiter = _RateLimiter(
            max_calls=rl_cfg.get("max_calls", 10),
            period=rl_cfg.get("period_seconds", 60),
        )

    def analyse(self) -> Signal:
        """Fetch Reddit posts, score sentiment via LLM, apply contrarian logic."""
        if not self._api_key:
            return self._fallback("No Anthropic api_key configured")

        fetcher = RedditFetcher(self._subreddits, max_posts=self._max_posts, sort=self._sort)
        posts = fetcher.fetch()

        if not posts:
            return self._fallback("No Reddit posts returned")

        llm_result = _score_via_llm(posts, self._api_key, self._model, self._rate_limiter)
        return self._build_signal(posts, llm_result)

    def score_with_posts(self, posts: list[RedditPost]) -> Signal:
        """Score a pre-fetched list of Reddit posts (for testing)."""
        if not self._api_key:
            return self._fallback("No Anthropic api_key configured")
        if not posts:
            return self._fallback("Empty post list")
        llm_result = _score_via_llm(posts, self._api_key, self._model, self._rate_limiter)
        return self._build_signal(posts, llm_result)

    def _build_signal(self, posts: list[RedditPost], llm: LLMSentiment) -> Signal:
        contrarian = _contrarian_score(llm.sentiment)
        confidence = self._compute_confidence(llm, len(posts))

        reasoning_parts = [
            f"Reddit posts analysed: {len(posts)}",
            f"Raw sentiment: {llm.sentiment:+.2f} ({self._sentiment_label(llm.sentiment)})",
            f"LLM reasoning: {llm.reasoning}",
            f"Contrarian signal: {contrarian:+.2f}",
            f"Confidence: {confidence:.2f}",
        ]

        return Signal(
            agent=self.name,
            score=round(contrarian, 4),
            confidence=round(confidence, 4),
            reasoning="\n".join(reasoning_parts),
        )

    def _fallback(self, reason: str) -> Signal:
        """Return a neutral, low-confidence signal when data is unavailable."""
        return Signal(
            agent=self.name,
            score=0.0,
            confidence=0.1,
            reasoning=f"Fallback: {reason}",
        )

    @staticmethod
    def _compute_confidence(llm: LLMSentiment, post_count: int) -> float:
        """Confidence from LLM self-rating (50%), sample size (30%), strength (20%)."""
        llm_conf = llm.confidence
        # Sample size: 25+ posts → 1.0, scales linearly below.
        sample = min(post_count / 25.0, 1.0)
        strength = abs(llm.sentiment)
        raw = 0.50 * llm_conf + 0.30 * sample + 0.20 * strength
        return float(np.clip(raw, 0.0, 1.0))

    @staticmethod
    def _sentiment_label(s: float) -> str:
        if s <= -0.6:
            return "extreme fear"
        if s <= -0.3:
            return "fear"
        if s <= 0.3:
            return "neutral"
        if s <= 0.6:
            return "greed"
        return "extreme greed"
