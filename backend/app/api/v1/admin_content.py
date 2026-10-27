"""Admin endpoints for learning content (docs/api.md, section Admin)."""

import uuid

from fastapi import APIRouter, Depends, Form, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_admin
from app.schemas.content import (
    MoveIn,
    OrderIn,
    PathDetail,
    PathIn,
    PathOut,
    PathPage,
    RevisionOut,
    StageIn,
    StageOut,
    StageUpdate,
    TaskContent,
    TaskCreate,
    TaskOut,
    VersionDetail,
    VersionIn,
    VersionOut,
    VersionUpdate,
)
from app.services import content_service as svc
from app.services import file_service

router = APIRouter(prefix="/admin", tags=["admin: content"])
Admin = Depends(require_admin)
Session = Depends(get_session)


@router.get("/paths", response_model=PathPage)
async def list_paths(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Admin,
    s: AsyncSession = Session,
):
    return await svc.list_paths(s, limit, offset)


@router.post("/paths", status_code=201, response_model=PathOut)
async def create_path(data: PathIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.create_path(s, a.user, data)


@router.get("/paths/{path_id}", response_model=PathDetail)
async def path_detail(path_id: uuid.UUID, _: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.path_detail(s, path_id)


@router.post("/paths/{path_id}/versions", status_code=201, response_model=VersionOut)
async def create_version(path_id: uuid.UUID, data: VersionIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.create_version(s, a.user, path_id, data)


@router.get("/path-versions/{version_id}", response_model=VersionDetail)
async def version_detail(version_id: uuid.UUID, _: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.version_detail(s, version_id)


@router.put("/path-versions/{version_id}", response_model=VersionOut)
async def update_version(version_id: uuid.UUID, data: VersionUpdate, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.update_version(s, a.user, version_id, data)


@router.put("/path-versions/{version_id}/stages/order", response_model=VersionDetail)
async def order_stages(version_id: uuid.UUID, data: OrderIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.order_stages(s, a.user, version_id, data.ids)


@router.post("/stages", status_code=201, response_model=StageOut)
async def create_stage(data: StageIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.create_stage(s, a.user, data)


@router.put("/stages/{stage_id}", response_model=StageOut)
async def update_stage(stage_id: uuid.UUID, data: StageUpdate, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.update_stage(s, a.user, stage_id, data)


@router.put("/stages/{stage_id}/tasks/order", response_model=list[TaskOut])
async def order_tasks(stage_id: uuid.UUID, data: OrderIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.order_tasks(s, a.user, stage_id, data.ids)


@router.post("/tasks", status_code=201, response_model=TaskOut)
async def create_task(data: TaskCreate, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.create_task(s, a.user, data)


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, _: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.get_task(s, task_id)


@router.put("/tasks/{task_id}", response_model=TaskOut, summary="Zapisz treść (nowa wersja treści)")
async def update_task(task_id: uuid.UUID, data: TaskContent, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.update_task(s, a.user, task_id, data)


@router.get("/tasks/{task_id}/revisions", response_model=list[RevisionOut])
async def list_revisions(task_id: uuid.UUID, _: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.list_revisions(s, task_id)


@router.put("/tasks/{task_id}/stage", response_model=TaskOut)
async def move_task(task_id: uuid.UUID, data: MoveIn, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.move_task(s, a.user, task_id, data.stage_id)


@router.post("/tasks/{task_id}/deactivate", response_model=TaskOut)
async def deactivate_task(task_id: uuid.UUID, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.set_task_active(s, a.user, task_id, False)


@router.post("/tasks/{task_id}/activate", response_model=TaskOut)
async def activate_task(task_id: uuid.UUID, a: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.set_task_active(s, a.user, task_id, True)


@router.post("/tasks/{task_id}/materials", status_code=201, response_model=TaskOut, summary="Dodaj zdjęcie wzorcowe")
async def add_material(
    task_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    caption: str | None = Form(default=None, max_length=300),
    a: CurrentUser = Admin,
    s: AsyncSession = Session,
):
    st = request.app.state
    return await file_service.add_material(s, st.storage, st.settings, a.user, task_id, file, caption)


@router.post("/tasks/{task_id}/attachments", status_code=201, response_model=TaskOut, summary="Dodaj załącznik PDF")
async def add_attachment(
    task_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    title: str | None = Form(default=None, max_length=300),
    a: CurrentUser = Admin,
    s: AsyncSession = Session,
):
    st = request.app.state
    return await file_service.add_pdf(s, st.storage, st.settings, a.user, task_id, file, title)
