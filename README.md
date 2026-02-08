# BTC Bot

A multi-agent Bitcoin DCA (Dollar-Cost Averaging) bot that dynamically adjusts buy sizes based on market signals. Includes a Streamlit dashboard for visualization and one-click trade execution.

## Architecture

Four specialized agents produce independent signals that an orchestrator blends into a single DCA decision:

| Agent | Weight | Data Source | What it measures |
|---|---|---|---|
| **Sentiment** | 25% | Twitter/X via Claude LLM | Social fear/greed with contrarian logic |
| **Geopolitical** | 15% | NewsAPI via Claude LLM | Macro/regulatory environment |
| **Technical** | 30% | Kraken OHLCV candles | RSI, MA crossover, MACD (daily + weekly) |
| **Cycle** | 30% | Halving dates + MVRV Z-Score | On-chain cycle positioning |

The orchestrator computes a confidence-weighted composite score and maps it to an action tier:

| Action | Multiplier | Condition |
|---|---|---|
| Strong Buy | 3x | Score >= 0.5 |
| Buy | 1.5x | Score >= 0.2 |
| Normal | 1x | -0.2 < Score < 0.2 |
| Reduce | 0.5x | Score <= -0.2 |
| Minimal | 0.2x | Score <= -0.5 |

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Configure API keys in `config.yaml`:

- **Kraken** &mdash; exchange API key/secret
- **OpenAI / Anthropic** &mdash; LLM for sentiment & geopolitical analysis
- **Twitter** &mdash; bearer token for tweet fetching
- **NewsAPI** &mdash; headlines for geopolitical agent

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

- `trading.dry_run` &mdash; when `true`, simulates orders without placing them
- `trading.kill_switch` &mdash; disables all trading when `true`
- `trading.max_order_usd` / `max_daily_usd` &mdash; safety limits
- `orchestrator.base_dca_usd` &mdash; base order size before multiplier
- `agents.<name>.weight` &mdash; per-agent influence on final score

## Project Structure

```
agents/          Agent implementations (sentiment, geopolitical, technical, cycle)
orchestrator/    Signal aggregation and DCA decision logic
execution/       Order execution and trade logging
models/          Shared data models (Signal)
dashboard.py     Streamlit UI
main.py          CLI entry point
config.yaml      All configuration
```
