from __future__ import annotations

import logging
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

# ── Dummy RAG store ──────────────────────────────────────────────────────────
# Simulates a vector DB with past meeting notes and participant profiles.

_RAG_STORE: list[dict] = [
    {
        "tags": ["alice", "q3", "sync", "product"],
        "content": "Past meeting with Alice (Jul 1): Discussed Q3 roadmap. Alice requested the analytics dashboard be prioritized. Action item: share updated timeline by Jul 8.",
    },
    {
        "tags": ["alice", "profile"],
        "content": "Alice profile: Senior PM at Acme Corp. Prefers morning meetings. Focused on data-driven decisions. Last meeting was Q3 roadmap sync.",
    },
    {
        "tags": ["marcus", "engineering", "auth"],
        "content": "Past meeting with Marcus (Jun 28): Auth refactor status. JWT implementation complete. Token refresh race condition identified as open issue.",
    },
    {
        "tags": ["budget", "q3", "finance"],
        "content": "Q3 budget review (Jun 15): Marketing budget approved at $50k. Engineering headcount frozen until Q4.",
    },
    {
        "tags": ["onboarding", "design", "dani"],
        "content": "Dani delivered onboarding screen designs on Jul 6. Pending engineering review from Marcus.",
    },
]


def _retrieve(subject: str, sender: str, top_k: int = 3) -> list[str]:
    """Simple keyword-based retrieval from the dummy RAG store."""
    query_tokens = set((subject + " " + sender).lower().split())
    scored = []
    for doc in _RAG_STORE:
        score = sum(1 for tag in doc["tags"] if tag in query_tokens)
        scored.append((score, doc["content"]))
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [content for _, content in scored[:top_k] if _ > 0]
    # Always return at least one generic context
    if not results:
        results = [_RAG_STORE[0]["content"]]
    return results


_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a meeting prep assistant. Generate a concise pre-meeting brief (3-5 bullet points) "
        "based on the meeting details and retrieved context below. Be specific and actionable.",
    ),
    (
        "human",
        "Meeting subject: {subject}\nWith: {sender}\nProposed slot: {slot}\n\n"
        "Retrieved context:\n{context}",
    ),
])


def generate_brief(subject: str, sender: str, slot: str) -> str:
    """Generate a pre-meeting brief using RAG context."""
    context_docs = _retrieve(subject, sender)
    context = "\n\n".join(f"- {d}" for d in context_docs)
    logger.info("[BriefGenerator] Generating brief for subject=%r sender=%r slot=%r", subject, sender, slot)

    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.3, api_key=GROQ_API_KEY)
    chain = _PROMPT | llm
    result = chain.invoke({"subject": subject, "sender": sender, "slot": slot, "context": context})
    return result.content
