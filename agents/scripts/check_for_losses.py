"""Deterministic loss-detection check for every connected Xero organisation.

Runs as a standalone script on a schedule (cron), not through the LLM --
this is a simple threshold check on a number Xero already gives us, so it
doesn't need an agent's reasoning, just needs to be fast and reliable.
Sends a short alert email the moment a business is newly found to be in a
loss (tracked via the loss_alerts table), not on every run while it
remains in a loss, so owners get notified once per new problem rather than
being spammed every cron cycle.

Usage: python agents/scripts/check_for_losses.py
Requires the same env vars as the reporter agent, plus the loss_alerts
table (see agents/scripts/loss_alerts.sql for the schema).
"""

import datetime as dt

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


def _get_last_status(user_id: str, tenant_id: str) -> str | None:
    resp = (
        _supabase()
        .table(LOSS_ALERTS_TABLE)
        .select("last_status")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    return resp.data[0]["last_status"] if resp.data else None


def _set_status(user_id: str, tenant_id: str, status: str, net_profit: float) -> None:
    _supabase().table(LOSS_ALERTS_TABLE).upsert(
        {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "last_status": status,
            "last_net_profit": net_profit,
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
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
                last_status = _get_last_status(user_id, tenant_id)

                if status == "loss" and last_status != "loss":
                    _send_loss_alert(tenant_id, tenant_name, net_profit, connection["access_token"])
                    print(f"[{tenant_name}] NEW LOSS DETECTED ({net_profit:,.2f}) -- alert sent")
                else:
                    print(f"[{tenant_name}] status={status} net_profit={net_profit:,.2f} (no alert needed)")

                _set_status(user_id, tenant_id, status, net_profit)
            except Exception as exc:
                print(f"[{tenant_name}] error: {exc}")


if __name__ == "__main__":
    from dotenv import load_dotenv

    # Cron runs with a bare environment, unlike an interactive shell where
    # the venv/.env are already sourced -- load it explicitly so this works
    # unattended.
    load_dotenv("root_agent/.env")
    check_all_customers()
