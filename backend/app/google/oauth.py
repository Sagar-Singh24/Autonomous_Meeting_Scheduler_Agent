from __future__ import annotations

import json

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from app.core.config import GOOGLE_CLIENT_SECRET_FILE, GOOGLE_SCOPES, GOOGLE_TOKEN_FILE


def get_oauth_credentials() -> Credentials:
    creds: Credentials | None = None

    # Load existing token
    if GOOGLE_TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(
            str(GOOGLE_TOKEN_FILE), scopes=GOOGLE_SCOPES
        )

    # If no valid creds → login
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                # Refresh token revoked or invalid — delete stale token and re-auth
                GOOGLE_TOKEN_FILE.unlink(missing_ok=True)
                creds = None
        if not creds or not creds.valid:
            if not GOOGLE_CLIENT_SECRET_FILE.exists():
                raise FileNotFoundError(
                    f"OAuth client secrets file not found: {GOOGLE_CLIENT_SECRET_FILE}"
                )
            raw = json.loads(GOOGLE_CLIENT_SECRET_FILE.read_text(encoding="utf-8"))
            if "installed" not in raw and "web" in raw and not raw["web"].get("redirect_uris"):
                raise ValueError(
                    "Invalid Google OAuth client JSON for local auth. "
                    "Use a Desktop app OAuth client (preferred), or add "
                    "http://localhost:8080/ as an authorized redirect URI for this web client."
                )

            # ✅ SIMPLE & RELIABLE FLOW
            flow = InstalledAppFlow.from_client_secrets_file(
                str(GOOGLE_CLIENT_SECRET_FILE),
                scopes=GOOGLE_SCOPES,
            )

            # Use an OS-selected free loopback port to avoid conflicts.
            creds = flow.run_local_server(port=0)

        # Save token
        GOOGLE_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        GOOGLE_TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")

    return creds