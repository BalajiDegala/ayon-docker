import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from ayon_server.helpers.modules import import_module
from addons.keycloak import package as package_module

# Import KeycloakAddon class from the addon server module
server_module = import_module(
    "keycloak_server",
    "addons/keycloak/1.0.0/server/__init__.py",
)
KeycloakAddon = server_module.KeycloakAddon
KeycloakSettings = server_module.KeycloakSettings


def build_app():
    app = FastAPI()
    addon = KeycloakAddon(
        definition=type("Def", (), {"friendly_name": "Keycloak"})(),
        addon_dir="addons/keycloak/1.0.0",
        name=package_module.name,
        version=package_module.version,
    )
    addon.setup()
    for router in addon.routers:
        app.include_router(router, prefix=f"/api/addons/{addon.name}/{addon.version}")
    return app, addon


def test_callback_returns_502_on_connection_error():
    app, addon = build_app()
    addon.get_studio_settings = AsyncMock(
        return_value=KeycloakSettings(
            url="http://localhost:1",
            realm="test",
            client_id="id",
            client_secret="secret",
        )
    )
    with patch("keycloak_server.httpx.AsyncClient.post", side_effect=server_module.httpx.ConnectError("fail")):
        client = TestClient(app)
        resp = client.get(
            "/api/addons/keycloak/1.0.0/auth/keycloak/callback",
            params={"code": "x", "redirect_uri": "http://app"},
        )
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Keycloak server unreachable"
