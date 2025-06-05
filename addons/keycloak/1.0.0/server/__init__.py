from __future__ import annotations

import httpx
from fastapi import APIRouter, Request, HTTPException, status

from ayon_server.addons import BaseServerAddon, SSOOption
from ayon_server.auth.models import LoginResponseModel
from ayon_server.auth.session import Session
from ayon_server.config import ayonconfig
from ayon_server.entities import UserEntity
from ayon_server.lib.postgres import Postgres
from ayon_server.logging import logger
from ayon_server.settings import BaseSettingsModel
from ayon_server.settings.settings_field import SettingsField


class KeycloakSettings(BaseSettingsModel):
    url: str = SettingsField("", title="Keycloak URL")
    realm: str = SettingsField("", title="Realm")
    client_id: str = SettingsField("", title="Client ID")
    client_secret: str = SettingsField("", title="Client Secret", widget="password")


class KeycloakAddon(BaseServerAddon):
    name = "keycloak"
    version = "1.0.0"
    title = "Keycloak"
    settings_model = KeycloakSettings

    def setup(self) -> None:
        router = APIRouter()

        @router.get("/auth/keycloak/callback")
        async def keycloak_callback(request: Request) -> LoginResponseModel:
            code = request.query_params.get("code")
            redirect_uri = request.query_params.get("redirect_uri")
            if not code or not redirect_uri:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code")

            settings = await self.get_studio_settings()
            if settings is None:
                raise HTTPException(status_code=500, detail="Addon not configured")

            token_url = f"{settings.url}/realms/{settings.realm}/protocol/openid-connect/token"
            data = {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": settings.client_id,
                "client_secret": settings.client_secret,
            }

            try:
                async with httpx.AsyncClient(timeout=ayonconfig.http_timeout) as client:
                    resp = await client.post(token_url, data=data)
            except httpx.RequestError:
                logger.error("Keycloak server unreachable")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Keycloak server unreachable",
                )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError:
                logger.error("Keycloak token request failed", resp.text)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token exchange failed")

            token = resp.json().get("access_token")
            if not token:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing")

            userinfo_url = f"{settings.url}/realms/{settings.realm}/protocol/openid-connect/userinfo"
            try:
                async with httpx.AsyncClient(timeout=ayonconfig.http_timeout) as client:
                    uresp = await client.get(
                        userinfo_url,
                        headers={"Authorization": f"Bearer {token}"},
                    )
            except httpx.RequestError:
                logger.error("Keycloak server unreachable")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Keycloak server unreachable",
                )
            try:
                uresp.raise_for_status()
            except httpx.HTTPStatusError:
                logger.error("Keycloak userinfo failed", uresp.text)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Userinfo failed")

            info = uresp.json()
            name = info.get("preferred_username") or info.get("sub")
            email = info.get("email")
            full_name = info.get("name")
            if not name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user info")

            result = await Postgres.fetch("SELECT * FROM public.users WHERE name = $1", name)
            if result:
                user = UserEntity.from_record(result[0])
            else:
                user = UserEntity(payload={"name": name, "attrib": {"email": email, "fullName": full_name}, "data": {}})
                await user.save()

            session = await Session.create(user, request)
            return LoginResponseModel(detail=f"Logged in as {user.name}", token=session.token, user=session.user)

        self.add_router(router)

    async def get_sso_options(self, base_url: str) -> list[SSOOption] | None:
        settings = await self.get_studio_settings()
        if settings is None or not settings.url or not settings.realm:
            return None

        auth_url = f"{settings.url}/realms/{settings.realm}/protocol/openid-connect/auth"
        callback = f"{base_url}/api/addons/{self.name}/{self.version}/auth/keycloak/callback"
        return [
            SSOOption(
                name="keycloak",
                title="Keycloak",
                redirect_key="redirect_uri",
                url=auth_url,
                args={
                    "client_id": settings.client_id,
                    "response_type": "code",
                    "scope": "openid email profile",
                },
                callback=callback,
            )
        ]
