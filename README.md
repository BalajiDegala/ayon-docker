ayon-docker
===========

This is the official Docker-based deployment for the Ayon Server. 
Ayon is a robust tool designed to manage and automate workflows in the animation and visual effects industries.

The Docker image includes both:

- [ayon-backend](https://github.com/ynput/ayon-backend): The server backend
- [ayon-frontend](https://github.com/ynput/ayon-frontend): Web interface


Installation
------------

You can use the provided `docker-compose.yml` as a template to start your own deployment.

For more information on installation and user guides, 
please visit our [documentation website](https://ayon.ynput.io/docs/system_introduction).

### Demo projects

To help you get familiar with the interface, the `demo/` directory includes three demo project templates:

- `demo_Commercial`
- `demo_Big_Episodic`
- `demo_Big_Feature`

To deploy these demo projects to your server, run:

- `make demo` on Unix systems
- `manage.ps1` demo on Windows

*NOTE: These demo projects can take a while to create.*

Keycloak SSO
------------

This compose file includes an optional **Keycloak** service. It is started on
port `8080` and uses its own PostgreSQL instance. The default administrator
credentials are `admin` / `changeme`.

### Example Keycloak setup

1. Browse to `http://localhost:8080` and log in as the Keycloak admin.
2. Create a realm (for example `ayon`).
3. Under that realm create a new *client* named `ayon` with `confidential`
   access type. Set the redirect URI to `http://localhost:5000/*` and save the
   generated client secret.

### Enabling SSO in Ayon

Set the following variables in the `server` service (they are already present
in the compose file):

```yaml
  KEYCLOAK_CLIENT_ID: ayon
  KEYCLOAK_CLIENT_SECRET: <secret from Keycloak>
  KEYCLOAK_ISSUER_URL: http://keycloak:8080/realms/ayon
```

After updating the values run `docker compose up -d` again. On restart the
frontend will offer a "Login with Keycloak" option and the backend will accept
tokens issued by the configured realm.

