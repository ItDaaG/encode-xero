import logging

# Ensure you have standard logging set up to catch errors
logger = logging.getLogger(__name__)

import os
from supabase import create_client, Client

def get_supabase_admin() -> Client:
    """Initializes the admin client using the new secret bypass key format."""
    supabase_url = os.environ.get("SUPABASE_URL")
    
    # Update this line to look for your actual variable name!
    supabase_secret = os.environ.get("SUPABASE_SECRET_KEY")
    
    if not supabase_url or not supabase_secret:
        raise ValueError(
            f"Missing environment variables. URL present: {bool(supabase_url)}, "
            f"Secret Key present: {bool(supabase_secret)}"
        )
        
    return create_client(supabase_url, supabase_secret)


async def get_users() -> dict:
    """Fetch all registered Supabase Auth users and print them for testing."""
    try:
        supabase = get_supabase_admin()
        
        # Try modern SDK client formatting (v2.x)
        try:
            response = supabase.auth.admin.list_users(options={"page": 1, "per_page": 1000})
            # If it's v2.x, the response is often a raw list directly
            raw_users = response if isinstance(response, list) else getattr(response, "users", [])
        except TypeError:
            # Fallback to older SDK client style (v1.x / v0.x)
            response = supabase.auth.admin.list_users(page=1, per_page=1000)
            raw_users = getattr(response, "users", [])

        users = [
            {
                "id": user.id,
                "email": user.email,
                "created_at": user.created_at,
            }
            for user in raw_users
        ]

        print(f"\n--- Supabase users ({len(users)}) ---")
        for user in users:
            print(f"  {user['id']}  {user['email'] or '(no email)'}  created={user['created_at']}")
        print("--- end ---\n")

        return {"status": "success", "count": len(users), "users": users}

    except Exception as e:
        logger.error(f"Failed to fetch users: {str(e)}")
        # Returning a safe payload to the LLM agent keeps the CLI loop alive
        return {"status": "error", "message": f"Could not fetch users due to an exception: {str(e)}"}
