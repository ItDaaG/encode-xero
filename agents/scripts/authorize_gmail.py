"""One-time interactive Gmail authorization for the reporter agent.

The reporter agent (tools/reporter_tools.py) runs unattended over a batch of
customers and can never complete a browser consent screen itself. Run this
script once, by hand, on a machine with a browser, to produce the token file
it reads at runtime.

Usage:
    GMAIL_CREDENTIALS_FILE=path/to/oauth_client.json \
    GMAIL_TOKEN_FILE=path/to/gmail_token.json \
    python agents/scripts/authorize_gmail.py

GMAIL_CREDENTIALS_FILE is the OAuth client secrets JSON downloaded from
Google Cloud Console (APIs & Services -> Credentials -> OAuth client ID ->
Desktop app). GMAIL_TOKEN_FILE is where the resulting refresh token gets
written -- point GMAIL_TOKEN_FILE at the same path when running the agent.
"""

import os

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def main() -> None:
    creds_file = os.environ["GMAIL_CREDENTIALS_FILE"]
    token_file = os.environ["GMAIL_TOKEN_FILE"]

    flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(token_file, "w") as f:
        f.write(creds.to_json())

    print(f"Gmail token written to {token_file}. The reporter agent can now send email unattended.")


if __name__ == "__main__":
    main()
