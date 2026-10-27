from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_authenticated_user
from app.schemas.auth import ChangePasswordIn, LoginIn, RefreshIn, RegisterIn, TokensOut
from app.schemas.user import UserOut
from app.services import auth_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])

# ADR-26: browsers keep the refresh token in an HttpOnly cookie the page's JavaScript can't read.
COOKIE = "pspk_refresh"
COOKIE_PATH = "/api/v1/auth"


def _is_web(request: Request) -> bool:
    return request.headers.get("x-client", "").lower() == "web"


def _tokens_response(request: Request, response: Response, tokens: auth_service.Tokens) -> TokensOut:
    if _is_web(request):
        response.set_cookie(
            COOKIE,
            tokens.refresh_token,
            expires=tokens.refresh_expires,
            path=COOKIE_PATH,
            secure=True,
            httponly=True,
            samesite="strict",
        )
        return TokensOut(access_token=tokens.access_token, expires_in=tokens.expires_in)
    return TokensOut(access_token=tokens.access_token, expires_in=tokens.expires_in, refresh_token=tokens.refresh_token)


def _refresh_token(request: Request, body: RefreshIn | None) -> str | None:
    return (body.refresh_token if body else None) or request.cookies.get(COOKIE)


@router.post("/register", status_code=201, response_model=UserOut, summary="Załóż konto (czeka na akceptację)")
async def register(data: RegisterIn, session: AsyncSession = Depends(get_session)) -> UserOut:
    user = await auth_service.register(session, data)
    return await user_service.to_out(session, user)


@router.post("/login", response_model=TokensOut, response_model_exclude_none=True)
async def login(data: LoginIn, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    tokens = await auth_service.login(session, request.app.state.settings, data.email, data.password)
    return _tokens_response(request, response, tokens)


@router.post("/refresh", response_model=TokensOut, response_model_exclude_none=True)
async def refresh(
    request: Request, response: Response, body: RefreshIn | None = None, session: AsyncSession = Depends(get_session)
):
    tokens = await auth_service.refresh(session, request.app.state.settings, _refresh_token(request, body))
    return _tokens_response(request, response, tokens)


@router.post("/logout", status_code=204)
async def logout(request: Request, body: RefreshIn | None = None, session: AsyncSession = Depends(get_session)):
    await auth_service.logout(session, request.app.state.settings, _refresh_token(request, body))
    response = Response(status_code=204)
    if _is_web(request) or request.cookies.get(COOKIE):
        response.delete_cookie(COOKIE, path=COOKIE_PATH, secure=True, httponly=True, samesite="strict")
    return response


@router.get("/me", response_model=UserOut)
async def me(current: CurrentUser = Depends(require_authenticated_user), session: AsyncSession = Depends(get_session)):
    return await user_service.to_out(session, current.user)


@router.post("/change-password", response_model=TokensOut, response_model_exclude_none=True)
async def change_password(
    data: ChangePasswordIn,
    request: Request,
    current: CurrentUser = Depends(require_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    access, ttl = await auth_service.change_password(
        session, request.app.state.settings, current.user, current.family_id, data.current_password, data.new_password
    )
    return TokensOut(access_token=access, expires_in=ttl)
