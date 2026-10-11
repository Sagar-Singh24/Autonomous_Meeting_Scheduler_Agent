from __future__ import annotations

import logging
from typing import Literal
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import GROQ_API_KEY

logger = logging.getLogger(__name__)


class ClassificationResult(BaseModel):
    label: Literal["meeting_request", "not_meeting"] = Field(
        description="'meeting_request' if the email is requesting/proposing a meeting, 'not_meeting' otherwise"
    )
    confidence: float = Field(description="Confidence score between 0.0 and 1.0")
    reason: str = Field(description="One sentence explaining the classification decision")
    extracted_time_hint: str | None = Field(
        default=None,
        description="Any time hint mentioned (e.g. 'next Tuesday', 'sometime next week'). Null if none."
    )


_parser = PydanticOutputParser(pydantic_object=ClassificationResult)

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an email classifier for a meeting scheduling assistant.
Classify the email as 'meeting_request' ONLY if it explicitly proposes, requests, or confirms a meeting, call, or sync.

Do NOT classify as meeting_request:
- Newsletters, promotions, or marketing emails
- Automated notifications or alerts
- Receipts or order confirmations
- Social media notifications
- Any email that does not involve a human requesting a meeting

{format_instructions}""",
    ),
    ("human", "Subject: {subject}\nFrom: {sender}\n\nSnippet: {snippet}"),
])


def classify_email(subject: str, sender: str, snippet: str) -> ClassificationResult:
    """Classify an email and log the decision for debugging."""
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, api_key=GROQ_API_KEY)
    chain = _PROMPT | llm | _parser
    result = chain.invoke({
        "subject": subject or "(no subject)",
        "sender": sender or "(unknown)",
        "snippet": snippet or "",
        "format_instructions": _parser.get_format_instructions(),
    })

    # Debug log — helps trace newsletter misclassifications
    logger.info(
        "[EmailClassifier] subject=%r sender=%r → label=%s confidence=%.2f reason=%r",
        subject, sender, result.label, result.confidence, result.reason,
    )
    return result
