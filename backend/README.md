## Backend (Python / FastAPI)

### What Day 2 delivers
- Google OAuth2 setup scaffold for **Gmail + Calendar scopes**.
- A local **Gmail polling listener** that detects unread emails and logs/stores their metadata.
- Demo endpoints:
  - `GET /api/health`
  - `GET /api/inbox/unread` (last polled unread messages)
  - `POST /api/poll` (force one poll cycle)

### Setup
1. Copy environment template:
   - `backend/.env.example` -> `backend/.env`
2. Add Google OAuth client secrets:
   - Download `credentials.json` from Google Cloud Console (OAuth client).
   - Put it at `backend/credentials.json` (or set `GOOGLE_CLIENT_SECRET_FILE`).
3. Install dependencies:
   - `pip install -r requirements.txt`

### Run
From `backend/`:
```shell
uvicorn app.main:app --reload --port 8000
```
Endpoints:
- `http://localhost:8000/api/health`
- `http://localhost:8000/api/inbox/unread`
- `http://localhost:8000/api/poll`

### OAuth notes (important for the demo)
- On first run, the server will open a local browser login flow and create `backend/token.json`.
- Ensure the OAuth client allows a loopback redirect (used by `run_local_server(port=0)`).
- For the Day 2 demo, send a test email to the connected account and confirm it shows up in `GET /api/inbox/unread`.

