import os
from pathlib import Path

from dotenv import load_dotenv

# Always load .env from the backend directory regardless of where uvicorn is launched
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_ENV_FILE, override=True)


def _as_path(name: str, default: str) -> Path:
    raw = os.getenv(name, default)
    return Path(raw).expanduser().resolve()


GOOGLE_CLIENT_SECRET_FILE = _as_path("GOOGLE_CLIENT_SECRET_FILE", "credentials.json")
GOOGLE_TOKEN_FILE = _as_path("GOOGLE_TOKEN_FILE", "token.json")

GMAIL_POLL_INTERVAL_SECONDS = int(os.getenv("GMAIL_POLL_INTERVAL_SECONDS", "15"))
GMAIL_MAX_MESSAGES = int(os.getenv("GMAIL_MAX_MESSAGES", "5"))
GMAIL_USER_ID = os.getenv("GMAIL_USER_ID", "me")

CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

GMAIL_MARK_AS_READ = os.getenv("GMAIL_MARK_AS_READ", "false").strip().lower() in {
    "1", "true", "yes", "y",
}

_SCOPE_CODES = [s.strip() for s in os.getenv("GOOGLE_SCOPES", "gmail.readonly,calendar.readonly").split(",") if s.strip()]

_SCOPE_MAP = {
    "gmail.readonly": "https://www.googleapis.com/auth/gmail.readonly",
    "gmail.modify": "https://www.googleapis.com/auth/gmail.modify",
    "gmail.send": "https://www.googleapis.com/auth/gmail.send",
    "calendar.readonly": "https://www.googleapis.com/auth/calendar.readonly",
    "calendar.events": "https://www.googleapis.com/auth/calendar.events",
}

GOOGLE_SCOPES = [_SCOPE_MAP.get(code, code) for code in _SCOPE_CODES]

# Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Scheduling preferences
SCHEDULE_WORK_START_HOUR = int(os.getenv("SCHEDULE_WORK_START_HOUR", "9"))
SCHEDULE_WORK_END_HOUR = int(os.getenv("SCHEDULE_WORK_END_HOUR", "18"))
SCHEDULE_MIN_SLOT_MINUTES = int(os.getenv("SCHEDULE_MIN_SLOT_MINUTES", "30"))
SCHEDULE_LOOKAHEAD_DAYS = int(os.getenv("SCHEDULE_LOOKAHEAD_DAYS", "7"))

