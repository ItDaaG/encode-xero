"""One-off demo data seeder for Xero sandbox/demo organisations.

Populates a connected, empty Xero org with a bank account, a couple of
contacts, and a handful of SPEND/RECEIVE bank transactions -- enough for
ProfitAndLoss, BalanceSheet, and BankSummary to show real, non-zero numbers
for a demo. Not part of the agent runtime; run manually against a specific
customer/org.

Usage:
    python agents/scripts/seed_demo_data.py <user_id> <tenant_id>

Requires the same env vars as the reporter agent (SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, XERO_CLIENT_ID, XERO_CLIENT_SECRET).
"""

import sys
import datetime as dt

import requests

from tools.reporter_tools import _ensure_fresh_token, _xero_headers, XERO_BASE_URL

BANK_ACCOUNT_CODE = "091"
BANK_ACCOUNT_NAME = "Demo Business Bank Account"


def _post(access_token: str, tenant_id: str, path: str, body: dict) -> dict:
    resp = requests.post(
        f"{XERO_BASE_URL}{path}",
        headers={**_xero_headers(access_token, tenant_id), "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"POST {path} failed: {resp.status_code} {resp.text}")
    return resp.json()


def _find_existing_bank_account(access_token: str, tenant_id: str) -> str | None:
    resp = requests.get(
        f"{XERO_BASE_URL}/api.xro/2.0/Accounts",
        headers=_xero_headers(access_token, tenant_id),
        timeout=30,
    )
    resp.raise_for_status()
    for account in resp.json()["Accounts"]:
        if account["Type"] == "BANK":
            return account["AccountID"]
    return None


def _ensure_bank_account(access_token: str, tenant_id: str) -> str:
    existing = _find_existing_bank_account(access_token, tenant_id)
    if existing:
        return existing
    result = _post(access_token, tenant_id, "/api.xro/2.0/Accounts", {
        "Code": BANK_ACCOUNT_CODE,
        "Name": BANK_ACCOUNT_NAME,
        "Type": "BANK",
        "BankAccountNumber": "12345678",
        "CurrencyCode": "GBP",
    })
    return result["Accounts"][0]["AccountID"]


def _ensure_contact(access_token: str, tenant_id: str, name: str) -> str:
    resp = requests.get(
        f"{XERO_BASE_URL}/api.xro/2.0/Contacts",
        headers=_xero_headers(access_token, tenant_id),
        params={"where": f'Name=="{name}"'},
        timeout=30,
    )
    resp.raise_for_status()
    existing = resp.json().get("Contacts", [])
    if existing:
        return existing[0]["ContactID"]
    result = _post(access_token, tenant_id, "/api.xro/2.0/Contacts", {"Contacts": [{"Name": name}]})
    return result["Contacts"][0]["ContactID"]


def seed(user_id: str, tenant_id: str, transactions: list[dict]) -> None:
    connection = _ensure_fresh_token(user_id)
    access_token = connection["access_token"]

    bank_account_id = _ensure_bank_account(access_token, tenant_id)
    print(f"Bank account ready: {bank_account_id}")

    for txn in transactions:
        contact_id = _ensure_contact(access_token, tenant_id, txn["contact"])
        result = _post(access_token, tenant_id, "/api.xro/2.0/BankTransactions", {
            "BankTransactions": [{
                "Type": txn["type"],
                "Contact": {"ContactID": contact_id},
                "Date": txn["date"],
                "LineItems": [{
                    "Description": txn["description"],
                    "Quantity": 1,
                    "UnitAmount": txn["amount"],
                    "AccountCode": txn["account_code"],
                }],
                "BankAccount": {"AccountID": bank_account_id},
            }],
        })
        status = result["BankTransactions"][0]["Status"]
        print(f"  {txn['type']:<8} {txn['amount']:>10.2f}  {txn['description']:<35} -> {status}")


if __name__ == "__main__":
    user_id, tenant_id = sys.argv[1], sys.argv[2]
    today = dt.date.today().isoformat()
    demo_transactions = [
        {"type": "RECEIVE", "contact": "Regular Customers", "date": "2026-07-02", "amount": 3200.00, "description": "Weekly till takings", "account_code": "200"},
        {"type": "RECEIVE", "contact": "Regular Customers", "date": today, "amount": 2850.00, "description": "Weekly till takings", "account_code": "200"},
        {"type": "SPEND", "contact": "Fresh Foods Supplier", "date": "2026-07-01", "amount": 1800.00, "description": "Stock purchase", "account_code": "310"},
        {"type": "SPEND", "contact": "City Properties Ltd", "date": "2026-07-01", "amount": 900.00, "description": "Monthly rent", "account_code": "469"},
        {"type": "SPEND", "contact": "Utility Co", "date": "2026-07-03", "amount": 210.00, "description": "Electricity and gas", "account_code": "445"},
        {"type": "SPEND", "contact": "AdBoost Marketing", "date": "2026-07-03", "amount": 150.00, "description": "Local advertising", "account_code": "400"},
    ]
    seed(user_id, tenant_id, demo_transactions)
