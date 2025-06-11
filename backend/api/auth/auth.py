"""API endpoints related to a user authentication. (excluding SSO)

- Login using username/password credentials
- Logout (revoke access token)
"""

from fastapi import Request
from typing import Any

from ayon_server.api.dependencies import AccessToken
from ayon_server.auth.models import LoginResponseModel, LogoutResponseModel
from ayon_server.auth.password import PasswordAuth
from ayon_server.auth.session import Session
from ayon_server.types import Field, OPModel
from pydantic import root_validator

from .router import router


class LoginRequestModel(OPModel):
    name: str | None = Field(
        None,
        title="User name",
        description="Username",
        example="admin",
    )
    email: str | None = Field(
        None,
        title="Email",
        description="Email address",
        example="user@example.com",
    )
    password: str = Field(
        ...,
        title="Password",
        description="Password",
        example="SecretPassword.123",
    )

    @root_validator(pre=True)
    def _check_identifier(cls, values: dict[str, Any]) -> dict[str, Any]:
        if not values.get("name") and not values.get("email"):
            raise ValueError("Either name or email must be provided")
        return values


@router.post("/login")
async def login(request: Request, login: LoginRequestModel) -> LoginResponseModel:
    """Login using name/password credentials.

    Returns access token and user information. The token is used for
    authentication in other endpoints. It is valid for 24 hours,
    but it is extended automatically when the user is active.

    Token may be revoked by calling the logout endpoint or using
    session manager.

    Returns 401 response if the credentials are invalid.
    """

    identifier = login.name or login.email or ""
    session = await PasswordAuth.login(
        identifier,
        login.password,
        request,
        email=login.email,
    )

    return LoginResponseModel(
        detail=f"Logged in as {session.user.name}",
        token=session.token,
        user=session.user,
    )


@router.post("/logout")
async def logout(access_token: AccessToken) -> LogoutResponseModel:
    """Log out the current user."""
    await Session.delete(access_token)
    return LogoutResponseModel()
