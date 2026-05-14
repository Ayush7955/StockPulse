# StockPulse — Multi-Asset Financial Analytics & Forecasting Platform

A full-stack stock market analysis platform with ML-powered price prediction. Supports **US Stocks, Indian NSE/BSE, Forex, and Crypto** — all powered by free Yahoo Finance data.

## Features

- 📈 **Price Charts** — Interactive candlestick charts with SMA, EMA, Bollinger Bands overlays
- 🤖 **ML Price Prediction** — 7-day and 30-day forecasts using Linear Regression with 13 features
- ⚠️ **Risk Analysis** — Volatility, Sharpe Ratio, VaR (95%/99%), Max Drawdown
- 📊 **Daily Returns** — Cumulative returns, histogram distribution, key stats
- 🔄 **Multi-Stock Comparison** — Normalized price overlay, correlation heatmap, Beta vs S&P 500
- 🇮🇳 **Indian Stocks** — RELIANCE.NS, TCS.NS, INFY.NS, HDFCBANK.NS and more
- 💱 **Forex** — USDINR, EURUSD, GBPUSD, USDJPY pairs
- ₿ **Crypto** — BTC, ETH, SOL, BNB, XRP, DOGE
- 🌙 **Dark Mode** — Warm dark theme with localStorage persistence
- ⚡ **Auto-Refresh** — Real-time data updates every 60 seconds
- 📄 **CSV Export** — Download OHLCV data for any stock

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python Flask |
| Data Source | yfinance (Yahoo Finance) |
| ML Model | scikit-learn LinearRegression |
| Charts | Chart.js |
| Design | Cursor-inspired warm minimalist UI |
| Deployment | Render.com |

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python server.py

# Open http://localhost:5000
```

## Deployment on Render

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect this repo
4. It auto-detects `render.yaml` — just click Deploy!

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stock/<ticker>` | OHLCV + indicators (SMA, EMA, Bollinger) |
| `GET /api/risk/<ticker>` | Volatility, Sharpe, VaR, Drawdown |
| `GET /api/returns/<ticker>` | Daily/cumulative returns, histogram |
| `GET /api/compare?tickers=X,Y` | Normalized comparison, correlation, beta |
| `GET /api/predict/<ticker>` | ML prediction with confidence bands |

## ML Prediction Details

**Features used**: SMA_10/20/50, EMA_10, Returns lag 1/5/10, Volatility 10/20, RSI, Momentum 10/20, Day-of-week

**Output**: 7-day and 30-day price targets with confidence bands and direction accuracy

> ⚠️ Predictions are for educational purposes only. Not financial advice.

## License

MIT
