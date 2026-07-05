"""
FX rate tracking for funding-timing alerts.

Only meaningful for a branch reporting in a currency other than the home
currency (GBP) -- a same-currency branch has no transfer-timing question at
all, so callers should skip it entirely rather than calling these for it.

Same free, keyless, no-signup rate API the frontend's currency selector
uses (open.er-api.com) -- one source of truth for exchange rates across
the whole app. That API only ever returns the *current* rate, so "is now a
good time to transfer" needs our own history: every check records a
snapshot, and favorability is judged against the oldest snapshot within a
lookback window (or the earliest one recorded at all, early on when there
isn't a full window of history yet).
"""

import datetime as dt

import requests

from tools.reporter_tools import _supabase

FX_RATES_URL = "https://open.er-api.com/v6/latest/GBP"
HOME_CURRENCY = "GBP"
SNAPSHOTS_TABLE = "fx_rate_snapshots"
FAVORABLE_THRESHOLD_PERCENT = 2.0
LOOKBACK_DAYS = 7


def fetch_current_rate(target_currency: str) -> float:
    """Units of target_currency per 1 GBP, right now."""
    resp = requests.get(FX_RATES_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("result") != "success":
        raise RuntimeError("Exchange rate API reported failure")
    rate = data["rates"].get(target_currency)
    if rate is None:
        raise ValueError(f"No rate available for {target_currency}")
    return rate


def record_fx_snapshot(target_currency: str, rate: float) -> None:
    _supabase().table(SNAPSHOTS_TABLE).insert({
        "base_currency": HOME_CURRENCY,
        "target_currency": target_currency,
        "rate": rate,
    }).execute()


def _get_baseline_rate(target_currency: str) -> float | None:
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    resp = (
        _supabase()
        .table(SNAPSHOTS_TABLE)
        .select("rate, recorded_at")
        .eq("base_currency", HOME_CURRENCY)
        .eq("target_currency", target_currency)
        .gte("recorded_at", cutoff)
        .order("recorded_at", desc=False)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["rate"]

    # No snapshot within the lookback window yet (e.g. this is one of the
    # first few runs) -- fall back to the earliest snapshot ever recorded,
    # so there's still *something* to compare against rather than nothing.
    resp = (
        _supabase()
        .table(SNAPSHOTS_TABLE)
        .select("rate")
        .eq("base_currency", HOME_CURRENCY)
        .eq("target_currency", target_currency)
        .order("recorded_at", desc=False)
        .limit(1)
        .execute()
    )
    return resp.data[0]["rate"] if resp.data else None


def evaluate_fx_favorability(target_currency: str) -> dict:
    """Records today's rate, then judges it against recent history.

    A *higher* rate (more target_currency per GBP) means GBP buys more of
    the local currency than before -- i.e. it's currently more efficient to
    send GBP to fund that branch.

    Returns:
        dict: {"status": "favorable" | "unfavorable" | "neutral" | "insufficient_history",
               "current_rate": float, "baseline_rate": float | None,
               "percent_change": float | None}
    """
    current_rate = fetch_current_rate(target_currency)
    record_fx_snapshot(target_currency, current_rate)

    baseline_rate = _get_baseline_rate(target_currency)
    if baseline_rate is None:
        return {
            "status": "insufficient_history",
            "current_rate": current_rate,
            "baseline_rate": None,
            "percent_change": None,
        }

    percent_change = ((current_rate - baseline_rate) / baseline_rate) * 100
    if percent_change >= FAVORABLE_THRESHOLD_PERCENT:
        status = "favorable"
    elif percent_change <= -FAVORABLE_THRESHOLD_PERCENT:
        status = "unfavorable"
    else:
        status = "neutral"

    return {
        "status": status,
        "current_rate": current_rate,
        "baseline_rate": baseline_rate,
        "percent_change": percent_change,
    }
