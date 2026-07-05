from shared.supabase_client import get_supabase_admin


def get_users() -> dict:
    """Fetch all registered Supabase Auth users and print them for testing."""
    supabase = get_supabase_admin()
    users_page = supabase.auth.admin.list_users(page=1, per_page=1000)

    users = [
        {
            "id": user.id,
            "email": user.email,
            "created_at": user.created_at,
        }
        for user in users_page
    ]

    print(f"\n--- Supabase users ({len(users)}) ---")
    for user in users:
        print(f"  {user['id']}  {user['email'] or '(no email)'}  created={user['created_at']}")
    print("--- end ---\n")

    return {"count": len(users), "users": users}
