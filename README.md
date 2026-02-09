# BTC Bot

A multi-agent Bitcoin DCA bot that opens 2x leveraged long positions on [Hyperliquid](https://app.hyperliquid.xyz) perpetual futures, dynamically sizing orders based on market signals. Includes a Streamlit dashboard for visualization and one-click trade execution.

## Strategy

Four agents each produce a **score** ([-1, +1]) and **confidence** ([0, 1]). The orchestrator blends them into a single composite score using confidence-weighted averaging, then maps that score to a DCA multiplier that scales the base order size.

### Signal Flow

```
Twitter tweets ──► Sentiment Agent  ──┐
NewsAPI headlines ► Geopolitical Agent ┤
Kraken OHLCV ────► Technical Agent  ──┼──► Orchestrator ──► DCA Multiplier ──► Hyperliquid
Halving + MVRV ──► Cycle Agent     ──┘        │                  │            (2x leveraged
                                         composite score    base $100 * Nx     perp longs)
```

### Agents

#### Technical (30% weight)

Fetches daily (400) and weekly (200) OHLCV candles from Kraken. Applies three indicators:

| Indicator | Weight | Logic |
|---|---|---|
| **RSI(14)** | 30% | Oversold (RSI 30) = +1, overbought (RSI 70) = -1, linear in between |
| **SMA Crossover** | 35% | (SMA50 - SMA200) / SMA200 as %, scaled so +/-5% gap = +/-1.0 |
| **MACD(12,26,9)** | 35% | MACD-signal crossover (60%) + histogram momentum (40%) |

Timeframe blending: **daily 60% + weekly 40%**. Confidence factors in indicator agreement (45%), magnitude (30%), and timeframe alignment (25%).

#### Cycle (30% weight)

Two sub-signals blended **55% cycle position + 45% MVRV Z-Score**:

**Cycle position** &mdash; days since last halving (2024-04-19) divided by average cycle length (1,458 days):
- Early (0-30%): +0.8 to +0.4 (accumulate)
- Mid (30-60%): +0.4 to +0.1
- Late (60-85%): +0.1 to -0.2
- Final (85-100%): -0.2 to -0.8 (distribute)

**MVRV Z-Score** &mdash; fetched live from CoinMetrics (monthly fallback table):
- Z < 0: deep value (+1.0)
- Z 0-2: accumulation zone (+0.6 to 0.0)
- Z 2-3.5: caution (0.0 to -0.5)
- Z 3.5-7: overheated (-0.5 to -1.0)
- Z >= 7: extreme bubble (-1.0)

#### Sentiment (25% weight)

Fetches up to 50 recent tweets from configured accounts (@saborskyn, @100trillionUSD, @wolonopmics, @DocumentingBTC, @BitcoinMagazine) and hashtags (#Bitcoin, #BTC). Claude LLM scores overall sentiment from -1 (extreme fear) to +1 (extreme greed).

**Contrarian flip**: the raw sentiment is inverted &mdash; `score = -0.8 * sentiment`. Extreme fear becomes a buy signal (+0.8), extreme greed becomes a sell signal (-0.8).

#### Geopolitical (15% weight)

Fetches up to 30 headlines from NewsAPI for queries like "bitcoin regulation", "banking crisis", "currency devaluation", "capital controls crypto". Claude LLM scores the macro environment from -1 (hostile) to +1 (favorable for BTC).

Positive factors: banking instability, currency devaluation, capital controls, regulatory clarity.
Negative factors: crackdowns, bans, enforcement actions, central bank hawkishness.

### Orchestrator

Computes a confidence-weighted composite score:

```
composite = SUM(weight_i * score_i * confidence_i) / SUM(weight_i * confidence_i)
```

Low-confidence signals are naturally down-weighted. The composite maps to an action tier:

| Action | Multiplier | Condition | Order size ($100 base) |
|---|---|---|---|
| Strong Buy | 3.0x | Score >= 0.5 | $300 |
| Buy | 1.5x | Score >= 0.2 | $150 |
| Normal | 1.0x | -0.2 < Score < 0.2 | $100 |
| Reduce | 0.5x | Score <= -0.2 | $50 |
| Minimal | 0.2x | Score <= -0.5 | $20 |

### Execution

All orders are **market buy** on BTC/USDC perpetual futures via Hyperliquid with **2x leverage**. The $100/day cap applies to margin deployed &mdash; total notional and position value accumulate over time.

Safety layers:
- **Kill switch** &mdash; halts all trading instantly
- **Max order cap** &mdash; single order clamped to $100
- **Daily spend limit** &mdash; $100 margin/day, tracked in a persistent ledger
- **Dry run mode** &mdash; simulates everything without placing real orders (default)
- **Testnet mode** &mdash; uses Hyperliquid testnet (default)

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root with your Hyperliquid credentials:

```
HYPERLIQUID_WALLET_ADDRESS=0xYourMainWalletAddress
HYPERLIQUID_PRIVATE_KEY=0xYourApiWalletPrivateKey
```

To get these credentials:
1. Go to [app.hyperliquid.xyz](https://app.hyperliquid.xyz) and connect your wallet
2. Navigate to More &rarr; API &rarr; Create API Wallet
3. Use your main wallet address for `HYPERLIQUID_WALLET_ADDRESS`
4. Use the generated API wallet private key for `HYPERLIQUID_PRIVATE_KEY`

Configure remaining API keys in `config.yaml` or as environment variables:

- **Anthropic** (`ANTHROPIC_API_KEY`) &mdash; Claude LLM for sentiment & geopolitical analysis
- **Twitter** (`TWITTER_BEARER_TOKEN`) &mdash; bearer token for tweet fetching
- **NewsAPI** (`NEWSAPI_KEY`) &mdash; headlines for geopolitical agent

## Usage

### Dashboard

```bash
streamlit run dashboard.py
```

### CLI

```bash
python main.py
```

## Configuration

All settings live in `config.yaml`:

- `exchange.testnet` &mdash; use Hyperliquid testnet when `true`
- `trading.leverage` &mdash; leverage multiplier for perp positions (default 2x)
- `trading.dry_run` &mdash; when `true`, simulates orders without placing them
- `trading.kill_switch` &mdash; disables all trading when `true`
- `trading.max_order_usd` / `max_daily_usd` &mdash; margin safety limits
- `orchestrator.base_dca_usd` &mdash; base order size before multiplier
- `agents.<name>.weight` &mdash; per-agent influence on final score

## Project Structure

```
agents/          Agent implementations (sentiment, geopolitical, technical, cycle)
orchestrator/    Signal aggregation and DCA decision logic
execution/       Order execution (Hyperliquid) and trade logging
models/          Shared data models (Signal)
dashboard.py     Streamlit UI
main.py          CLI entry point
config.yaml      All configuration
.env             Hyperliquid credentials (gitignored)
```
