"""Deterministic loss-detection and funding-timing check for every
connected Xero organisation.

Runs as a standalone script on a schedule (cron), not through the LLM --
these are simple threshold/comparison checks on numbers Xero and the FX
rate API already give us, so they don't need an agent's reasoning, just
need to be fast and reliable.

Two alerts, both deduped so owners get notified on *change*, not spammed
every cron cycle:
1. Loss alert -- sent the moment a business is newly found to be in a loss
   (tracked via loss_alerts.last_status).
2. FX timing alert -- sent when a business that's *currently* in a loss
   (i.e. needs funding) and reports in a currency other than GBP newly
   becomes a favorable time to transfer GBP to it (tracked via
   loss_alerts.last_fx_status). Skipped entirely for GBP-reporting
   branches -- there's no transfer-timing question when there's no
   currency mismatch.

Usage: python agents/scripts/check_for_losses.py
Requires the same env vars as the reporter agent, plus the loss_alerts and
fx_rate_snapshots tables (see agents/scripts/loss_alerts.sql and
agents/scripts/fx_tracking.sql for the schemas).
"""

import datetime as dt

from tools.fx_tools import HOME_CURRENCY, evaluate_fx_favorability
from tools.legislation_tools import _get_country_and_currency
from tools.reporter_tools import (
    _ensure_fresh_token,
    _get_admin_email,
    _get_reports,
    _list_tenants,
    _send_email_via_gmail,
    _supabase,
)

LOSS_ALERTS_TABLE = "loss_alerts"


def _find_row_value(rows: list, labels: list[str]) -> float | None:
    for row in rows:
        cells = row.get("Cells")
        if cells and (cells[0].get("Value") or "").strip().lower() in labels and len(cells) > 1:
            try:
                return float(cells[-1]["Value"])
            except (KeyError, ValueError, TypeError):
                return None
        nested = row.get("Rows")
        if nested:
            result = _find_row_value(nested, labels)
            if result is not None:
                return result
    return None


def _get_net_profit(financials: dict) -> float | None:
    rows = financials["profit_and_loss"]["Reports"][0]["Rows"]
    return _find_row_value(rows, ["net profit", "net profit/(loss)", "profit for the year"])


def _get_alert_row(user_id: str, tenant_id: str) -> dict:
    resp = (
        _supabase()
        .table(LOSS_ALERTS_TABLE)
        .select("last_status, last_fx_status")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return resp.data[0] if resp.data else {"last_status": None, "last_fx_status": None}


def _upsert_alert_row(user_id: str, tenant_id: str, **fields) -> None:
    _supabase().table(LOSS_ALERTS_TABLE).upsert(
        {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            **fields,
        },
        on_conflict="user_id,tenant_id",
    ).execute()


def _send_loss_alert(tenant_id: str, tenant_name: str, net_profit: float, access_token: str) -> None:
    admin_email = _get_admin_email(access_token, tenant_id)
    body = (
        f"Heads up -- {tenant_name} is currently running at a loss of "
        f"{abs(net_profit):,.2f} for the current period, based on its latest "
        "Xero Profit & Loss report.\n\n"
        "This is an automated alert from FlowSync. Log in to your dashboard "
        "for the full breakdown."
    )
    _send_email_via_gmail(
        to_email=admin_email,
        subject=f"⚠ {tenant_name} is currently operating at a loss",
        body_text=body,
        attachments=[],
    )


def _send_fx_timing_alert(
    tenant_id: str, tenant_name: str, currency: str, fx: dict, access_token: str
) -> None:
    admin_email = _get_admin_email(access_token, tenant_id)
    body = (
        f"{tenant_name} is currently in a loss and needs funding -- and right now "
        f"looks like a good time to send it. {HOME_CURRENCY} has strengthened "
        f"{fx['percent_change']:.1f}% against {currency} over the last few days "
        f"(1 {HOME_CURRENCY} now buys {fx['current_rate']:.2f} {currency}, vs "
        f"{fx['baseline_rate']:.2f} {currency} recently), so the same "
        f"{HOME_CURRENCY} transfer covers more of its {currency} costs than usual.\n\n"
        "This is an automated alert from FlowSync, based on tracked exchange-rate "
        "history -- not financial advice."
    )
    _send_email_via_gmail(
        to_email=admin_email,
        subject=f"💱 Good time to send funds to {tenant_name}",
        body_text=body,
        attachments=[],
    )


def check_all_customers() -> None:
    rows = _supabase().table("xero_connections").select("user_id").execute().data or []

    for row in rows:
        user_id = row["user_id"]
        try:
            connection = _ensure_fresh_token(user_id)
            tenants = _list_tenants(connection["access_token"])
        except Exception as exc:
            print(f"[{user_id}] skipped: {exc}")
            continue

        for tenant in tenants:
            tenant_id, tenant_name = tenant["tenant_id"], tenant["tenant_name"]
            try:
                financials = _get_reports(connection["access_token"], tenant_id)
                net_profit = _get_net_profit(financials)
                if net_profit is None:
                    print(f"[{tenant_name}] could not determine net profit, skipping")
                    continue

                status = "loss" if net_profit < 0 else "profit"
                alert_row = _get_alert_row(user_id, tenant_id)

                if status == "loss" and alert_row["last_status"] != "loss":
                    _send_loss_alert(tenant_id, tenant_name, net_profit, connection["access_token"])
                    print(f"[{tenant_name}] NEW LOSS DETECTED ({net_profit:,.2f}) -- alert sent")
                else:
                    print(f"[{tenant_name}] status={status} net_profit={net_profit:,.2f} (no loss alert needed)")

                fx_status = alert_row["last_fx_status"]
                if status == "loss":
                    currency = _get_country_and_currency(connection["access_token"], tenant_id)["base_currency"]
                    if currency != HOME_CURRENCY:
                        fx = evaluate_fx_favorability(currency)
                        fx_status = fx["status"]
                        if fx_status == "favorable" and alert_row["last_fx_status"] != "favorable":
                            _send_fx_timing_alert(tenant_id, tenant_name, currency, fx, connection["access_token"])
                            print(f"[{tenant_name}] FAVORABLE FX WINDOW ({fx['percent_change']:+.1f}%) -- alert sent")
                        else:
                            print(f"[{tenant_name}] fx_status={fx_status} (no fx alert needed)")
                    else:
                        print(f"[{tenant_name}] reports in {HOME_CURRENCY}, no FX timing to check")
                else:
                    fx_status = None  # not in a loss -- no funding-timing question right now

                _upsert_alert_row(user_id, tenant_id, last_status=status, last_net_profit=net_profit, last_fx_status=fx_status)
            except Exception as exc:
                print(f"[{tenant_name}] error: {exc}")


if __name__ == "__main__":
    from dotenv import load_dotenv

    # Cron runs with a bare environment, unlike an interactive shell where
    # the venv/.env are already sourced -- load it explicitly so this works
    # unattended.
    load_dotenv("root_agent/.env")
    check_all_customers()
