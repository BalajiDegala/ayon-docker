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

### Keycloak SSO Addon

The repository includes an optional Keycloak addon providing single sign‑on support.
Configure the addon via the following environment variables or addon settings:

- `KEYCLOAK_URL` – Base URL of the Keycloak server.
- `KEYCLOAK_REALM` – Keycloak realm to authenticate against.
- `KEYCLOAK_CLIENT_ID` – OAuth client identifier.
- `KEYCLOAK_CLIENT_SECRET` – OAuth client secret.

Set these variables when launching the container or define them in the addon settings page to enable Keycloak authentication.

`KEYCLOAK_URL` must be reachable from inside the AYON container. When running
Keycloak on the host machine, use `http://host.docker.internal:<port>` on
Docker Desktop or add an `extra_hosts: ["host.docker.internal:host-gateway"]`
entry (or your host IP address) when using Linux.

Alternatively, you can run Keycloak as part of the provided compose stack. The
`docker-compose.yml` file defines `keycloak` and `keycloak-db` services suitable
for production. In this setup, set `KEYCLOAK_URL` to `http://keycloak:8080` so
that the server can reach Keycloak on the internal Docker network.

