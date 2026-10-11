from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import CORS_ALLOW_ORIGINS, GMAIL_POLL_INTERVAL_SECONDS
from app.pollers.gmail_poller import GmailPoller

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Autonomous Meeting Scheduler Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


async def gmail_poll_loop(app_: FastAPI) -> None:
    while True:
        try:
            poller: GmailPoller | None = getattr(app_.state, "gmail_poller", None)
            if poller is not None:
                new_messages = await poller.poll_once()
                if new_messages:
                    logger.info("Background poll: %d new message(s)", len(new_messages))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Gmail polling loop error")
        await asyncio.sleep(GMAIL_POLL_INTERVAL_SECONDS)


@app.on_event("startup")
async def on_startup() -> None:
    app.state.gmail_poller = None
    app.state.gmail_init_error = None
    app.state.langgraph_last_result = None
    app.state.gmail_poll_task = asyncio.create_task(gmail_poll_loop(app))
    logger.info("Backend started.")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    task = getattr(app.state, "gmail_poll_task", None)
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
