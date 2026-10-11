from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import GROQ_API_KEY


# ── Pydantic schema ──────────────────────────────────────────────────────────

class ActionItem(BaseModel):
    description: str = Field(description="What needs to be done")
    assignee: Optional[str] = Field(default=None, description="Person responsible (null if unclear)")
    deadline: Optional[str] = Field(default=None, description="Due date or timeframe (null if not mentioned)")


class KeyDecision(BaseModel):
    decision: str = Field(description="A key decision made during the meeting")
    owner: Optional[str] = Field(default=None, description="Person who owns this decision (null if unclear)")


class MeetingExtractionResult(BaseModel):
    summary: str = Field(description="2-3 sentence summary of the meeting")
    key_decisions: list[KeyDecision] = Field(description="Key decisions made")
    action_items: list[ActionItem] = Field(description="Action items with assignees and deadlines")


# ── Chain ────────────────────────────────────────────────────────────────────

_parser = PydanticOutputParser(pydantic_object=MeetingExtractionResult)

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        (
            "You are an expert meeting analyst. Extract structured information from the "
            "meeting transcript below. Be precise — only include what is explicitly stated "
            "or clearly implied. Do not invent assignees or deadlines.\n\n"
            "{format_instructions}"
        ),
    ),
    ("human", "Transcript:\n\n{transcript}"),
])


def build_extraction_chain():
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in environment.")
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, api_key=GROQ_API_KEY)
    return _PROMPT | llm | _parser


def extract_from_transcript(transcript: str) -> MeetingExtractionResult:
    chain = build_extraction_chain()
    return chain.invoke({
        "transcript": transcript,
        "format_instructions": _parser.get_format_instructions(),
    })
