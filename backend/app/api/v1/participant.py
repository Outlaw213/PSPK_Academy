"""Participant endpoints (docs/api.md, section Uczestnik)."""

import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_authenticated_user, require_participant
from app.schemas.participant import MyPath, PathProgress, PathStructure, TaskDetail
from app.schemas.submission import (
    CommentIn,
    DraftIn,
    PhotoOut,
    QuizAttemptIn,
    QuizResult,
    SubmissionDetail,
    SubmissionOut,
)
from app.schemas.user import UserOut
from app.services import file_service, quiz_service, user_service
from app.services import participant_service as svc
from app.services import submission_service as subs

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


# --- attempts (M6) ---------------------------------------------------------------------------


@router.get("/tasks/{task_id}/submissions", response_model=list[SubmissionOut], summary="Historia prób")
async def task_history(task_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await subs.history(s, p.user, task_id)


@router.post(
    "/tasks/{task_id}/submissions", status_code=201, response_model=SubmissionOut, summary="Rozpocznij próbę (szkic)"
)
async def create_draft(
    task_id: uuid.UUID, data: DraftIn | None = None, p: CurrentUser = Participant, s: AsyncSession = Session
):
    sub = await subs.create_draft(s, p.user, task_id, data.comment if data else None)
    return await subs.to_out(s, sub)


@router.post("/tasks/{task_id}/quiz-attempts", status_code=201, response_model=QuizResult, summary="Rozwiąż quiz")
async def quiz_attempt(
    task_id: uuid.UUID, data: QuizAttemptIn, p: CurrentUser = Participant, s: AsyncSession = Session
):
    return await quiz_service.attempt(s, p.user, task_id, data.answers)


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
async def submission_detail(submission_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await subs.detail(s, p.user, submission_id)


@router.patch("/submissions/{submission_id}", response_model=SubmissionOut)
async def update_comment(
    submission_id: uuid.UUID, data: CommentIn, p: CurrentUser = Participant, s: AsyncSession = Session
):
    return await subs.to_out(s, await subs.update_comment(s, p.user, submission_id, data.comment))


@router.post("/submissions/{submission_id}/photos", status_code=201, response_model=PhotoOut)
async def add_photo(
    submission_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    p: CurrentUser = Participant,
    s: AsyncSession = Session,
):
    photo = await subs.add_photo(s, request.app.state.storage, request.app.state.settings, p.user, submission_id, file)
    return PhotoOut(
        id=photo.id,
        position=photo.position,
        mime_type=photo.mime_type,
        file_size=photo.file_size,
        width=photo.width,
        height=photo.height,
    )


@router.delete("/submissions/{submission_id}/photos/{photo_id}", status_code=204)
async def delete_photo(
    submission_id: uuid.UUID,
    photo_id: uuid.UUID,
    request: Request,
    p: CurrentUser = Participant,
    s: AsyncSession = Session,
):
    await subs.delete_photo(s, request.app.state.storage, p.user, submission_id, photo_id)


@router.get(
    "/submissions/{submission_id}/photos/{photo_id}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
async def get_photo(
    submission_id: uuid.UUID,
    photo_id: uuid.UUID,
    request: Request,
    u: CurrentUser = Depends(require_authenticated_user),
    s: AsyncSession = Session,
):
    # Owner, an instructor with permission for the task, or an admin (BR-17); everyone else gets 404.
    data, mime = await subs.photo_bytes(s, request.app.state.storage, u, submission_id, photo_id)
    return Response(content=data, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})


@router.get(
    "/tasks/{task_id}/materials/{material_id}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
    summary="Zdjęcie wzorcowe",
)
async def get_material(
    task_id: uuid.UUID,
    material_id: uuid.UUID,
    request: Request,
    u: CurrentUser = Depends(require_authenticated_user),
    s: AsyncSession = Session,
):
    data, mime = await file_service.material_bytes(s, request.app.state.storage, u, task_id, material_id)
    return Response(content=data, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})


@router.get(
    "/tasks/{task_id}/attachments/{attachment_id}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
    summary="Załącznik PDF",
)
async def get_attachment(
    task_id: uuid.UUID,
    attachment_id: uuid.UUID,
    request: Request,
    u: CurrentUser = Depends(require_authenticated_user),
    s: AsyncSession = Session,
):
    data, title = await file_service.attachment_bytes(s, request.app.state.storage, u, task_id, attachment_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(title + '.pdf')}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/submissions/{submission_id}/submit", response_model=SubmissionOut, summary="Wyślij do oceny")
async def submit(submission_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await subs.to_out(s, await subs.submit(s, p.user, submission_id))


@router.post("/submissions/{submission_id}/cancel", response_model=SubmissionOut, summary="Porzuć szkic / wycofaj")
async def cancel(submission_id: uuid.UUID, p: CurrentUser = Participant, s: AsyncSession = Session):
    return await subs.to_out(s, await subs.cancel(s, p.user, submission_id))
