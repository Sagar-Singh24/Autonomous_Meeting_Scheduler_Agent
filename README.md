## Autonomous Meeting Scheduler & Prep Agent (Project 7)

### Day 1 deliverable
- Formal project document: `docs/PROJECT_DOCUMENT_DAY1.md`

### Day 2 deliverable (OAuth + polling verification)
- FastAPI backend Gmail polling listener:
  - `backend/app/main.py`
  - Demo endpoints:
    - `GET http://localhost:8000/api/health`
    - `GET http://localhost:8000/api/inbox/unread`
    - `POST http://localhost:8000/api/poll`
- Next.js dashboard skeleton:
  - `frontend/src/app/page.tsx`

### Day 3 deliverable (Core intelligence)
- Slot negotiation logic (free/busy + working-hours enforcement):
  - `backend/app/google/calendar_api.py`
  - `GET http://localhost:8000/api/slots?duration_minutes=30&recipient_name=Alice&meeting_subject=Q3+sync`
- Whisper audio transcription agent:
  - `backend/app/agents/transcription.py`
  - `POST http://localhost:8000/api/transcribe` (multipart file upload)
- LangChain + Pydantic extraction chain (action items, decisions, assignees, deadlines):
  - `backend/app/agents/extraction.py`
  - `POST http://localhost:8000/api/extract` body: `{"transcript": "..."}`
- Real messy meeting transcript for testing:
  - `backend/data/sample_transcript.txt`
- Test suite (slot negotiator):
  - `backend/tests/test_slot_negotiator.py`
  - Run: `pytest backend/tests/test_slot_negotiator.py -v`

### Quick start (local demo)
1. Backend
   - Create `backend/.env` from `backend/.env.example`.
   - Put Google OAuth client secrets JSON at `backend/credentials.json` (or set `GOOGLE_CLIENT_SECRET_FILE`).
   - Install + run:
     ```shell
     cd backend
     pip install -r requirements.txt
     uvicorn app.main:app --reload --port 8000
     ```

2. Frontend
   - Install + run:
     ```shell
     cd frontend
     npm install
     npm run dev
     ```

3. Verify Day 2
   - Start with the backend running (first OAuth login will open a browser and create `backend/token.json`).
   - Send a test email to the connected Gmail inbox.
   - Check the Next.js page for detected unread messages (click `Poll now` if needed).

