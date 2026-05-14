"""
StockPulse v2 — Stock Market Analysis Backend
Flask API: stock data, risk, returns, comparison, prediction (ML), market data
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
import traceback
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="/static")
CORS(app)

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}

def safe(val):
    if val is None or (isinstance(val, float) and np.isnan(val)): return None
    return val.item() if hasattr(val, "item") else val

def flat_cols(df):
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df

def fetch(ticker, period="1y"):
    if period not in VALID_PERIODS: period = "1y"
    df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
    df = flat_cols(df)
    if df.empty: return None
    df.index = pd.to_datetime(df.index)
    return df

# ── Stock Data + Indicators ──
@app.route("/api/stock/<ticker>")
def stock_data(ticker):
    try:
        period = request.args.get("period", "1y")
        df = fetch(ticker.upper(), period)
        if df is None: return jsonify({"error": f"No data for {ticker.upper()}"}), 404
        close = df["Close"]
        df["SMA_20"] = close.rolling(20).mean()
        df["SMA_50"] = close.rolling(50).mean()
        df["SMA_200"] = close.rolling(200).mean()
        df["EMA_20"] = close.ewm(span=20, adjust=False).mean()
        bb_mid = close.rolling(20).mean(); bb_std = close.rolling(20).std()
        df["BB_Upper"] = bb_mid + 2*bb_std; df["BB_Lower"] = bb_mid - 2*bb_std

        crosses = []
        if len(df) > 200:
            s50, s200 = df["SMA_50"].dropna(), df["SMA_200"].dropna()
            ci = s50.index.intersection(s200.index)
            for i in range(1, len(ci)):
                pd_ = s50.loc[ci[i-1]] - s200.loc[ci[i-1]]
                cd_ = s50.loc[ci[i]] - s200.loc[ci[i]]
                if pd_ <= 0 < cd_: crosses.append({"date": str(ci[i].date()), "type": "golden"})
                elif pd_ >= 0 > cd_: crosses.append({"date": str(ci[i].date()), "type": "death"})

        lc = safe(close.iloc[-1]); pc = safe(close.iloc[-2]) if len(close) > 1 else lc
        chg = lc - pc; chg_pct = (chg / pc * 100) if pc else 0

        try:
            info = yf.Ticker(ticker.upper()).info
            name = info.get("shortName", ticker.upper())
            currency = info.get("currency", "USD")
        except: name, currency = ticker.upper(), "USD"

        return jsonify({
            "ticker": ticker.upper(), "name": name, "currency": currency,
            "current_price": safe(lc), "previous_close": safe(pc),
            "change": safe(chg), "change_pct": safe(chg_pct),
            "dates": [str(d.date()) for d in df.index],
            "open": [safe(v) for v in df["Open"]], "high": [safe(v) for v in df["High"]],
            "low": [safe(v) for v in df["Low"]], "close": [safe(v) for v in close],
            "volume": [safe(v) for v in df["Volume"]],
            "sma_20": [safe(v) for v in df["SMA_20"]], "sma_50": [safe(v) for v in df["SMA_50"]],
            "sma_200": [safe(v) for v in df["SMA_200"]], "ema_20": [safe(v) for v in df["EMA_20"]],
            "bb_upper": [safe(v) for v in df["BB_Upper"]], "bb_lower": [safe(v) for v in df["BB_Lower"]],
            "bb_mid": [safe(v) for v in bb_mid], "crosses": crosses,
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({"error": str(e)}), 500

# ── Risk Analysis ──
@app.route("/api/risk/<ticker>")
def risk_analysis(ticker):
    try:
        period = request.args.get("period", "1y")
        df = fetch(ticker.upper(), period)
        if df is None: return jsonify({"error": f"No data for {ticker.upper()}"}), 404
        close = df["Close"]; dr = close.pct_change().dropna()
        if len(dr) < 2: return jsonify({"error": "Not enough data"}), 400
        mr, sr = dr.mean(), dr.std()
        vol = sr * np.sqrt(252)
        sharpe = (mr / sr) * np.sqrt(252) if sr > 0 else 0
        var95 = float(mr + stats.norm.ppf(0.05) * sr)
        var99 = float(mr + stats.norm.ppf(0.01) * sr)
        cum = (1 + dr).cumprod(); rm = cum.cummax(); dd = (cum - rm) / rm
        return jsonify({
            "ticker": ticker.upper(), "period": period,
            "volatility": safe(vol), "volatility_pct": safe(vol*100),
            "sharpe_ratio": safe(sharpe), "var_95": safe(var95), "var_95_pct": safe(var95*100),
            "var_99": safe(var99), "var_99_pct": safe(var99*100),
            "max_drawdown": safe(dd.min()), "max_drawdown_pct": safe(dd.min()*100),
            "drawdown_dates": [str(d.date()) for d in dd.index],
            "drawdown_values": [safe(v) for v in dd],
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({"error": str(e)}), 500

# ── Daily Returns ──
@app.route("/api/returns/<ticker>")
def daily_returns(ticker):
    try:
        period = request.args.get("period", "1y")
        df = fetch(ticker.upper(), period)
        if df is None: return jsonify({"error": f"No data for {ticker.upper()}"}), 404
        close = df["Close"]; pr = close.pct_change().dropna()
        lr = np.log(close / close.shift(1)).dropna(); cum = ((1+pr).cumprod()-1)
        hc, he = np.histogram(pr, bins=40)
        hl = [f"{safe(he[i]):.4f}" for i in range(len(hc))]
        pos = int((pr > 0).sum()); neg = int((pr < 0).sum()); tot = len(pr)
        return jsonify({
            "ticker": ticker.upper(), "dates": [str(d.date()) for d in pr.index],
            "daily_returns": [safe(v) for v in pr], "daily_returns_pct": [safe(v*100) for v in pr],
            "log_returns": [safe(v) for v in lr], "cumulative_returns_pct": [safe(v*100) for v in cum],
            "histogram": {"labels": hl, "counts": [int(c) for c in hc]},
            "stats": {"mean_return": safe(pr.mean()*100), "best_day": safe(pr.max()*100),
                      "worst_day": safe(pr.min()*100), "positive_days": pos, "negative_days": neg,
                      "total_days": tot, "positive_pct": round(pos/tot*100,1) if tot else 0},
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({"error": str(e)}), 500

# ── Comparison ──
@app.route("/api/compare")
def compare_stocks():
    try:
        tp = request.args.get("tickers", "")
        period = request.args.get("period", "1y")
        tickers = [t.strip().upper() for t in tp.split(",") if t.strip()]
        if len(tickers) < 2: return jsonify({"error": "Need at least 2 tickers"}), 400
        frames = {}
        for t in tickers[:6]:
            d = fetch(t, period)
            if d is not None and "Close" in d.columns: frames[t] = d["Close"]
        if len(frames) < 2: return jsonify({"error": "Not enough data"}), 404
        combined = pd.DataFrame(frames).dropna()
        if combined.empty: return jsonify({"error": "No overlapping data"}), 404
        norm = combined / combined.iloc[0] * 100
        ret_df = combined.pct_change().dropna(); corr = ret_df.corr()
        betas = {}
        spy = fetch("SPY", period)
        if spy is not None:
            spy_r = flat_cols(spy)["Close"].pct_change().dropna()
            for t in frames:
                tr = combined[t].pct_change().dropna()
                c = pd.DataFrame({"s": tr, "b": spy_r}).dropna()
                if len(c) > 10: betas[t] = safe(c["s"].cov(c["b"]) / c["b"].var())
        return jsonify({
            "tickers": list(frames.keys()), "dates": [str(d.date()) for d in norm.index],
            "normalized": {t: [safe(v) for v in norm[t]] for t in frames},
            "correlation": {"labels": list(corr.columns),
                           "matrix": [[safe(corr.iloc[i,j]) for j in range(len(corr.columns))] for i in range(len(corr.index))]},
            "betas": betas,
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({"error": str(e)}), 500

# ── ML Prediction ──
@app.route("/api/predict/<ticker>")
def predict(ticker):
    try:
        period = request.args.get("period", "1y")
        df = fetch(ticker.upper(), "2y")  # Always use 2y for training
        if df is None: return jsonify({"error": f"No data for {ticker.upper()}"}), 404
        close = df["Close"]
        if len(close) < 60: return jsonify({"error": "Need at least 60 data points"}), 400

        # Feature engineering
        feat = pd.DataFrame(index=df.index)
        feat["close"] = close
        feat["sma_10"] = close.rolling(10).mean()
        feat["sma_20"] = close.rolling(20).mean()
        feat["sma_50"] = close.rolling(50).mean()
        feat["ema_10"] = close.ewm(span=10, adjust=False).mean()
        feat["ret_1"] = close.pct_change(1)
        feat["ret_5"] = close.pct_change(5)
        feat["ret_10"] = close.pct_change(10)
        feat["vol_10"] = close.pct_change().rolling(10).std()
        feat["vol_20"] = close.pct_change().rolling(20).std()
        # RSI
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss
        feat["rsi"] = 100 - (100 / (1 + rs))
        feat["day_of_week"] = df.index.dayofweek
        # Momentum
        feat["mom_10"] = close / close.shift(10) - 1
        feat["mom_20"] = close / close.shift(20) - 1

        # Target: 7-day forward return
        feat["target_7d"] = close.shift(-7) / close - 1
        feat["target_30d"] = close.shift(-30) / close - 1
        feat["future_7d"] = close.shift(-7)
        feat["future_30d"] = close.shift(-30)

        feat = feat.dropna()
        if len(feat) < 30: return jsonify({"error": "Not enough data after feature engineering"}), 400

        feature_cols = ["sma_10", "sma_20", "sma_50", "ema_10", "ret_1", "ret_5",
                       "ret_10", "vol_10", "vol_20", "rsi", "day_of_week", "mom_10", "mom_20"]

        # Train/test split (last 20% for testing)
        split = int(len(feat) * 0.8)
        train = feat.iloc[:split]; test = feat.iloc[split:]
        X_train = train[feature_cols]; y_train_7 = train["target_7d"]; y_train_30 = train["target_30d"]
        X_test = test[feature_cols]; y_test_7 = test["target_7d"]

        # Train models
        model_7d = LinearRegression().fit(X_train, y_train_7)
        model_30d = LinearRegression().fit(X_train, y_train_30)

        # Accuracy metrics
        pred_test = model_7d.predict(X_test)
        r2 = r2_score(y_test_7, pred_test)
        direction_acc = np.mean(np.sign(pred_test) == np.sign(y_test_7)) * 100

        # Predict future
        last_row = feat[feature_cols].iloc[-1:].values
        pred_7d_ret = model_7d.predict(last_row)[0]
        pred_30d_ret = model_30d.predict(last_row)[0]
        current_price = safe(close.iloc[-1])
        pred_7d_price = current_price * (1 + pred_7d_ret)
        pred_30d_price = current_price * (1 + pred_30d_ret)

        # Residual std for confidence bands
        residuals = y_test_7.values - pred_test
        res_std = np.std(residuals)

        # Forecast line: last 30 historical + 30 forecast days
        hist_n = min(60, len(close))
        hist_dates = [str(d.date()) for d in close.index[-hist_n:]]
        hist_prices = [safe(v) for v in close.iloc[-hist_n:]]

        # Generate forecast dates (skip weekends)
        last_date = close.index[-1]
        forecast_dates = []
        forecast_prices = []
        upper_band = []
        lower_band = []
        d = last_date
        for i in range(1, 31):
            d = d + pd.Timedelta(days=1)
            while d.weekday() >= 5: d = d + pd.Timedelta(days=1)
            forecast_dates.append(str(d.date()))
            # Linear interpolation between current and predicted
            if i <= 7:
                p = current_price + (pred_7d_price - current_price) * (i / 7)
            else:
                p = pred_7d_price + (pred_30d_price - pred_7d_price) * ((i - 7) / 23)
            forecast_prices.append(safe(p))
            band_width = current_price * res_std * np.sqrt(i)
            upper_band.append(safe(p + band_width))
            lower_band.append(safe(p - band_width))

        return jsonify({
            "ticker": ticker.upper(),
            "current_price": current_price,
            "pred_7d": safe(pred_7d_price), "pred_7d_change": safe(pred_7d_ret * 100),
            "pred_30d": safe(pred_30d_price), "pred_30d_change": safe(pred_30d_ret * 100),
            "direction": "up" if pred_30d_ret > 0 else "down",
            "accuracy": safe(direction_acc), "r2": safe(r2),
            "hist_dates": hist_dates, "hist_prices": hist_prices,
            "forecast_dates": forecast_dates, "forecast_prices": forecast_prices,
            "upper_band": upper_band, "lower_band": lower_band,
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({"error": str(e)}), 500

# ── Search ──
@app.route("/api/search/<query>")
def search_ticker(query):
    try:
        t = yf.Ticker(query.upper()); info = t.info
        if not info or info.get("regularMarketPrice") is None:
            test = yf.download(query.upper(), period="5d", progress=False)
            test = flat_cols(test)
            if test.empty: return jsonify({"error": "Not found"}), 404
            return jsonify({"ticker": query.upper(), "name": query.upper(), "valid": True})
        return jsonify({"ticker": query.upper(), "name": info.get("shortName", query.upper()),
                        "currency": info.get("currency", "USD"), "valid": True})
    except: return jsonify({"error": "Not found"}), 404

# ── Serve Frontend ──
@app.route("/")
def index(): return send_file(os.path.join(BASE_DIR, "index.html"))

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  StockPulse v2 — Stock Market Analysis + ML Prediction")
    print("  Running at http://localhost:5000")
    print("="*60 + "\n")
    app.run(debug=True, port=5000)
