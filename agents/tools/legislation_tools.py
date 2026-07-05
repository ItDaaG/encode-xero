"""
Tools for the tax/legislation chat agent.

SECURITY DESIGN NOTE (read before modifying):
The current user's identity comes from `tool_context.user_id` -- the ADK
session's own user_id, set by the API layer from the caller's authenticated
Supabase session, never from an LLM-supplied argument. This means a chat
message can never make the agent fetch another customer's Xero data: the
only "user_id" that exists for these tools is whoever the session actually
belongs to. Contrast with reporter_tools.py, where user_id IS an LLM/batch
argument because that agent's whole job is iterating over every customer.
"""

from google.adk.tools.tool_context import ToolContext

from tools.reporter_tools import _ensure_fresh_token, _list_tenants, _get_reports, _xero_headers, XERO_BASE_URL
import requests


def _get_country_and_currency(access_token: str, tenant_id: str) -> dict[str, str]:
    resp = requests.get(
        f"{XERO_BASE_URL}/api.xro/2.0/Organisation",
        headers=_xero_headers(access_token, tenant_id),
        timeout=30,
    )
    resp.raise_for_status()
    org = resp.json()["Organisations"][0]
    return {"country_code": org.get("CountryCode", ""), "base_currency": org.get("BaseCurrency", "")}


def list_my_organisations(tool_context: ToolContext) -> dict:
    """Lists every Xero organisation the current user has connected, with
    each one's country and base currency -- use this to work out which
    jurisdiction's legislation is relevant before searching.

    Takes no arguments: it always reflects whoever is asking, never another
    customer's data.

    Returns:
        dict: {"status": "success",
               "organisations": [{"tenant_id": str, "tenant_name": str, "country_code": str, "base_currency": str}, ...]}
              or {"status": "error", "error_message": str}
    """
    try:
        connection = _ensure_fresh_token(tool_context.user_id)
        tenants = _list_tenants(connection["access_token"])
        organisations = []
        for tenant in tenants:
            info = _get_country_and_currency(connection["access_token"], tenant["tenant_id"])
            organisations.append({**tenant, **info})
        return {"status": "success", "organisations": organisations}
    except Exception as exc:
        return {"status": "error", "error_message": str(exc)}


def get_my_financials(tenant_id: str, tool_context: ToolContext) -> dict:
    """Fetches Profit & Loss, Balance Sheet, and Bank Summary for one of the
    current user's own connected organisations, identified by tenant_id from
    list_my_organisations. Use this to ground legislative answers in the
    user's actual figures (e.g. checking a revenue figure against a
    registration threshold) instead of asking them to state numbers by hand.

    Xero will reject this call if tenant_id doesn't belong to the current
    user's own connection, so this can't be used to read another customer's
    organisation.

    Args:
        tenant_id: Opaque Xero organisation identifier from list_my_organisations.

    Returns:
        dict: {"status": "success", "tenant_id": str, "financials": {...}}
              or {"status": "error", "tenant_id": str, "error_message": str}
    """
    try:
        connection = _ensure_fresh_token(tool_context.user_id)
        financials = _get_reports(connection["access_token"], tenant_id)
        return {"status": "success", "tenant_id": tenant_id, "financials": financials}
    except Exception as exc:
        return {"status": "error", "tenant_id": tenant_id, "error_message": str(exc)}
