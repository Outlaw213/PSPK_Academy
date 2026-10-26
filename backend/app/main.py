import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.api.v1 import router as v1_router
from app.config import Settings, get_settings
from app.database import make_engine, make_sessionmaker
from app.errors import install_error_handlers


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await engine.dispose()

    app = FastAPI(
        title="PSPK Akademia API",
        version="0.1.0",
        description="Backend PSPK Akademii — źródło prawdy o rolach, dostępie i statusach zadań.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)

    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(v1_router)
    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = create_app()
