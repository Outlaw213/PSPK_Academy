"""Participant endpoints (docs/api.md, section Uczestnik)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_participant
from app.schemas.participant import MyPath, PathProgress, PathStructure, TaskDetail
from app.schemas.user import UserOut
from app.services import participant_service as svc
from app.services import user_service

router = APIRouter(tags=["participant"])
Participant = Depends(require_participant)
Session = Depends(get_session)


@router.get("/me", response_model=UserOut)
async def me(p: CurrentUser = Participant, s: AsyncSession = Session):
    return await user_service.to_out(s, p.user)


@router.get("/me/paths", response_model=list[MyPath])
async def my_paths(p: CurrentUser = Participant, s: AsyncSession = Session):
    return await svc.my_paths(s, p.user)


@router.get("/me/paths/{path_version_id}", response_model=PathStructure)
async def path_structure(path_version_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await svc.structure(s, p.user, path_version_id)


@router.get("/me/paths/{path_version_id}/progress", response_model=PathProgress)
async def path_progress(path_version_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await svc.progress(s, p.user, path_version_id)


@router.get("/tasks/{task_id}", response_model=TaskDetail)
async def task_detail(task_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await svc.task_detail(s, p.user, task_id)
