import os

from supabase import Client, create_client


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

