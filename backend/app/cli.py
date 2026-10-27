"""Operator commands. `python -m app.cli create-admin --email ...` bootstraps the first admin (FR-AUTH-08)."""

import argparse
import asyncio
import sys
from getpass import getpass

from app.config import get_settings
from app.database import make_engine, make_sessionmaker
from app.errors import AppError
from app.services import audit_service, user_service

MIN_PASSWORD = 10


async def create_admin(email: str, first_name: str, last_name: str) -> None:
    # The password is typed at a prompt: never a CLI argument (shell history, ps) and never printed.
    password = getpass("Hasło (min. 10 znaków): ")
    if len(password) < MIN_PASSWORD:
        sys.exit("Hasło musi mieć co najmniej 10 znaków.")
    if getpass("Powtórz hasło: ") != password:
        sys.exit("Hasła się różnią.")

    engine = make_engine(get_settings())
    try:
        async with make_sessionmaker(engine)() as session:
            try:
                user = await user_service.create_user(
                    session,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    status="ACTIVE",
                    roles=["ADMIN"],
                )
            except AppError:
                sys.exit(f"Konto {email.lower()} już istnieje.")
            audit_service.record(session, None, "USER_CREATED", "user", user.id, {"roles": ["ADMIN"], "via": "cli"})
            await session.commit()
    finally:
        await engine.dispose()
    print(f"Utworzono administratora {email.lower()}.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("create-admin", help="Załóż konto administratora")
    p.add_argument("--email", required=True)
    p.add_argument("--first-name", default="Administrator")
    p.add_argument("--last-name", default="PSPK")
    args = parser.parse_args()
    if args.command == "create-admin":
        asyncio.run(create_admin(args.email, args.first_name, args.last_name))


if __name__ == "__main__":
    main()
