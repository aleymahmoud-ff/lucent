# CranL Documentation
*CranL Cloud Platform v1.5 — Full Documentation*

---

## Overview

CranL is a cloud platform for deploying applications and managing databases across global regions. Deploy from GitHub with automatic builds, managed databases, CDN, SSL, and custom domains — all from the dashboard, CLI, or your AI coding assistant.

**Features:**
- Git-based deployments — Push to GitHub, CranL builds and deploys automatically
- Managed databases — PostgreSQL, MySQL, MariaDB, MongoDB, Redis
- Global regions — Europe, USA, MENA, Asia
- Built-in CDN & SSL — Every app gets HTTPS and edge caching out of the box
- Custom domains — Point your domain, SSL provisioned automatically
- CLI & MCP — Manage everything from the terminal or let your AI assistant do it

---

# GETTING STARTED

## Quickstart

This guide walks you through deploying your first application on CranL in under 5 minutes.

**Prerequisites:** A CranL account at app.cranl.com, a GitHub repository with your application code, and the CranL CLI installed.

### Step 1: Install the CLI
See the Installation section below.

### Step 2: Authenticate
Generate an API key from your dashboard settings, then:
```
cranl login <your-api-key>
```
Keys start with `cranl_sk_`. Get one from your dashboard settings.

### Step 3: Connect GitHub
```
cranl github connect
```
This opens your browser to connect the CranL GitHub App to your repositories.

### Step 4: Create & Deploy an App
```
cranl apps create --repo <repository-id>
```
You can also specify options:
```
cranl apps create --repo <repository-id> --name my-api --branch main --build-type nixpacks --region germany-1
```
Use `cranl github repos` to list available repository IDs. Your app deploys automatically after creation. Check status with `cranl apps list`.

### Step 5: Add a Database (Optional)
```
cranl db create --type pg --name mydb --inject <app-id>
```
This creates a PostgreSQL database and injects `DATABASE_URL` into your app's environment variables.

### Step 6: Add a Custom Domain (Optional)
```
cranl apps domains add <app-id> example.com
```
Then point a CNAME record from `example.com` to your app's `.cranl.net` subdomain. SSL is provisioned automatically.

---

## Installation

The CranL CLI is a single binary with no dependencies. Runs on macOS, Linux, and Windows.

### Install Script (Recommended)

**macOS & Linux:**
```
curl -fsSL https://cranl.com/install.sh | bash
```
This will: detect your OS and architecture, download the correct binary, verify the SHA-256 checksum, install to `/usr/local/bin/cranl` (or `~/.cranl/bin/` if no root access), and add to PATH if needed.

**Windows:**
```
powershell -NoExit -c "irm https://cranl.com/install.ps1 | iex"
```
Installs to `%LOCALAPPDATA%\cranl\cranl.exe` and adds it to your user PATH.

### Manual Download

Download the binary from https://cli.cranl.com/:

| Platform | Binary |
|---|---|
| Linux x64 | cranl-linux-x64 |
| Linux ARM64 | cranl-linux-arm64 |
| macOS x64 (Intel) | cranl-darwin-x64 |
| macOS ARM64 (Apple Silicon) | cranl-darwin-arm64 |
| Windows x64 | cranl-windows-x64.exe |

After downloading:
```
chmod +x cranl-linux-x64
sudo mv cranl-linux-x64 /usr/local/bin/cranl
```

### Verify Installation
```
cranl version
```
Expected output: `v1.5 BETA`

### Updating
```
cranl update
```
Downloads and replaces the binary in-place. Prompts for sudo if in a root-owned directory.

### Uninstalling
```
sudo rm /usr/local/bin/cranl
rm -rf ~/.cranl
```

---

# CLI REFERENCE

## Overview

```
cranl <command> [subcommand] [arguments] [flags]
```

| Command | Description |
|---|---|
| `cranl login` | Authenticate with an API key |
| `cranl logout` | Remove stored credentials |
| `cranl whoami` | Show current user info |
| `cranl projects list` | List projects |
| `cranl projects create` | Create a project |
| `cranl projects select` | Set default project |
| `cranl apps list` | List applications |
| `cranl apps create` | Create application from GitHub |
| `cranl apps deploy` | Trigger deployment |
| `cranl apps logs` | View runtime logs |
| `cranl apps env set` | Set environment variables |
| `cranl db list` | List databases |
| `cranl db create` | Create managed database |
| `cranl regions` | List deploy regions |
| `cranl mcp` | Start MCP server for AI IDEs |
| `cranl update` | Self-update the CLI |
| `cranl version` | Print version |

**Configuration** is stored in `~/.cranl/config.json` (0600 permissions):
```json
{
  "api_key": "cranl_sk_...",
  "api_url": "https://app.cranl.com",
  "default_project_id": "uuid"
}
```

**Global Behavior:**
- All API communication is over HTTPS (HTTP is rejected)
- Authentication uses Bearer token in the Authorization header
- The CLI never echoes your API key after initial login
- Commands that require a project use the default project set by `cranl projects select`

---

## Authentication

### `cranl login <api-key>`
Validates key format (must start with `cranl_sk_`), verifies against the API, stores in `~/.cranl/config.json`.
```
$ cranl login cranl_sk_abc12345...
✓ Authenticated as alice@example.com (My Organization)
```

### `cranl logout`
Deletes the API key and default project ID from the local config file.
```
$ cranl logout
✓ Logged out successfully.
```

### `cranl whoami`
Displays current user and organization information.
```
$ cranl whoami
Email: alice@example.com
Name: Alice Smith
Organization: My Organization
Org ID: 550e8400-e29b-41d4-a716-446655440000
Project: Production
```

---

## Projects

Projects are containers for applications and databases. Every resource belongs to a project.

### `cranl projects list`
List all projects you have access to. Alias: `cranl projects`.
```
$ cranl projects list
Name         ID                                     Default
Production   550e8400-e29b-41d4-a716-446655440000   ✓
Staging      660e8400-e29b-41d4-a716-446655440001
```

### `cranl projects create <name>`
Create a new project. If this is your first project, it is automatically set as the default.
```
$ cranl projects create "Staging"
✓ Project "Staging" created (660e8400-e29b-41d4-a716-446655440001)
```

### `cranl projects select <project-id>`
Set a default project. Many commands (like `cranl apps create`) require a default project.
```
$ cranl projects select 660e8400-e29b-41d4-a716-446655440001
✓ Default project set to "Staging"
```
Run `cranl projects list` first to find the project ID.

---

## Applications

### `cranl apps list`
List all applications you have access to. Alias: `cranl apps`. Status is color-coded: green (running/done), red (error), yellow (idle).

### `cranl apps create`
```
cranl apps create --repo <repository-id> [--name NAME] [--branch BRANCH] [--build-type TYPE] [--region REGION]
```

Prerequisites:
- Default project must be set (`cranl projects select <project-id>`)
- GitHub must be connected (`cranl github connect`)

| Flag | Required | Description |
|---|---|---|
| `--repo <id>` | Yes | GitHub repository ID (from `cranl github repos`) |
| `--name <name>` | No | Application name (defaults to repo name) |
| `--branch <branch>` | No | Git branch to deploy (defaults to main) |
| `--build-type <type>` | No | `nixpacks` or `dockerfile` (defaults to nixpacks) |
| `--region <region>` | No | Deploy region (defaults to germany-1) |

The application deploys automatically after creation.
```
$ cranl apps create --repo 12345 --name my-api --region us-east-1
✓ Application "my-api" created (a1b2c3d4-...)
```

### `cranl apps info <app-id>`
Show details for an application (name, ID, status, branch, URL, created date).

### `cranl apps delete <app-id> --yes`
Delete an application. Requires `--yes` to confirm.

### `cranl apps deploy <app-id>`
Trigger a new deployment.

### `cranl apps logs <app-id>`
View runtime logs for an application.

### `cranl apps monitoring <app-id>`
View CPU, memory, and disk usage.
```
CPU: 12.5%
Memory: 256.0 / 512.0 MB
Disk: 128.0 / 1024.0 MB
```

### Lifecycle Commands
- `cranl apps start <app-id>` — Start a stopped application
- `cranl apps stop <app-id>` — Stop a running application
- `cranl apps restart <app-id>` — Restart an application (soft reload)
- `cranl apps rebuild <app-id>` — Rebuild an application from source

### Environment Variables
- `cranl apps env list <app-id>` — List environment variables
- `cranl apps env set <app-id> KEY=VALUE [KEY2=VALUE2 ...]` — Set one or more (merges with existing)
- `cranl apps env unset <app-id> KEY [KEY2 ...]` — Remove one or more environment variables
- `cranl apps env push <app-id> [file]` — Upload a `.env` file (defaults to `.env`, merges with existing)

### Deployment History
- `cranl apps deployments list <app-id>` — View deployment history
- `cranl apps deployments logs <app-id> <deployment-id>` — View build logs for a specific deployment

---

## Databases

CranL provides managed databases with automatic provisioning, backups, and connection string management.

**Supported Types:**

| Type | Value | Aliases |
|---|---|---|
| PostgreSQL | postgresql | pg, postgres |
| MySQL | mysql | — |
| MariaDB | mariadb | — |
| MongoDB | mongodb | mongo |
| Redis | redis | — |

### `cranl db list`
List all databases. Alias: `cranl db`.

### `cranl db create`
```
cranl db create --name <name> --type <type> [--region REGION] [--inject APP-ID]
```

| Flag | Required | Description |
|---|---|---|
| `--name <name>` | Yes | Database name |
| `--type <type>` | Yes | Database type (postgresql, mysql, mariadb, mongodb, redis) |
| `--region <region>` | No | Deploy region alias |
| `--inject <app-id>` | No | Inject DATABASE_URL into an application |

Region aliases: `eu`/`europe` = Germany 1, `us`/`usa` = US East 1, `mena`/`sa` = Saudi Arabia 1, `egypt`/`eg` = Egypt 1, `asia`/`india` = India 1.
```
$ cranl db create --name mydb --type pg --region eu --inject a1b2c3d4
✓ Database "mydb" (postgresql) created. ID: db-001
✓ Injected DATABASE_URL into app a1b2c3d4
```

### `cranl db info <db-id>`
Show database details including connection string.

### `cranl db delete <db-id> --yes`
Delete a database. **Warning: This permanently deletes the database and all its data. Cannot be undone.**

### `cranl db start <db-id>` / `cranl db stop <db-id>`
Start or stop a database.

---

## Domains

Every application gets a free `*.cranl.net` subdomain with SSL. You can also add custom domains.

### `cranl apps domains list <app-id>`
List all domains configured for an application.

### `cranl apps domains add <app-id> <domain>`
Add a custom domain to an application.
```
$ cranl apps domains add a1b2c3d4 api.example.com
✓ Domain "api.example.com" added.
Point a CNAME record to: my-api-abc123.cranl.net
```

### DNS Configuration
After adding a custom domain, create a CNAME record:

| Type | Name | Value |
|---|---|---|
| CNAME | api.example.com | my-api-abc123.cranl.net |

For root domains (`example.com`), use an A record or ALIAS/ANAME if your DNS provider supports it. SSL is provisioned automatically once the DNS record is active.

---

## GitHub

CranL connects to GitHub via the CranL GitHub App.

### `cranl github status`
Check if GitHub is connected for the current project.
```
$ cranl github status
✓ GitHub is connected. 12 repositories synced.
```

### `cranl github connect`
Opens `https://app.cranl.com/dashboard` in your browser to install the GitHub App.

### `cranl github repos`
List synced GitHub repositories. Syncs with GitHub first to pick up any new repos.

---

## Regions

### `cranl regions`
List all available deploy regions.

| Region | Server | Location | Status |
|---|---|---|---|
| Europe | Germany 1 | Germany (DE) | Available |
| Europe | Turkey 1 | Turkey (TR) | Coming Soon |
| USA | US East 1 | United States (US) | Available |
| MENA | Saudi Arabia 1 | Saudi Arabia (SA) | Available |
| MENA | Egypt 1 | Egypt (EG) | Available |
| MENA | UAE 1 | UAE (AE) | Coming Soon |
| Asia | India 1 | India (IN) | Available |
| Asia | Singapore 1 | Singapore (SG) | Coming Soon |
| Asia | Japan 1 | Japan (JP) | Coming Soon |

**Note:** MENA regions (Saudi Arabia, Egypt, UAE) require a Pro or Enterprise plan.

CLI region aliases:

| Alias | Region |
|---|---|
| eu, europe | Germany 1 |
| us, usa | US East 1 |
| mena, sa | Saudi Arabia 1 |
| egypt, eg | Egypt 1 |
| asia, india | India 1 |

---

# API REFERENCE

**Base URL:** `https://app.cranl.com/api`

**Authentication:** All API requests require a Bearer token:
```
curl -H "Authorization: Bearer cranl_sk_..." https://app.cranl.com/api/applications
```

**Response Format:** All responses are JSON. Error responses:
```json
{ "error": "Description of the error" }
```

**HTTP Status Codes:**

| Code | Description |
|---|---|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid or missing API key) |
| 403 | Forbidden (insufficient permissions or suspended account) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

**Rate Limits:** 120 requests per minute per API key. Returns 429 when exceeded.

---

## API Authentication

### API Key Format
```
cranl_sk_<32 random characters>
```
Example: `cranl_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Creating API Keys
1. Go to Dashboard Settings
2. Scroll to the API Keys section
3. Click Create API Key
4. Enter a descriptive name
5. Copy the key — it is shown only once

You can have up to 10 active API keys.

### Using API Keys
```bash
curl -X GET \
  -H "Authorization: Bearer cranl_sk_..." \
  -H "Content-Type: application/json" \
  https://app.cranl.com/api/applications
```

### Verify API Key
**`POST /api/cli/auth/verify`**

Verify an API key and return user and organization information.

Request Headers: `Authorization: Bearer cranl_sk_...`

Response:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@example.com",
    "firstName": "Alice",
    "lastName": "Smith"
  },
  "organization": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "My Organization"
  }
}
```

### Revoking API Keys
Revoke a key from the dashboard settings page. Revoked keys stop working immediately.

### Security Best Practices
- Never commit API keys to version control
- Use environment variables to store keys in CI/CD
- Rotate keys regularly — create a new key, update your systems, then revoke the old one
- Use descriptive names (e.g., "CI/CD Pipeline", "Local Development")
- Keys are stored as bcrypt hashes on the server — a database breach does not expose your keys

---

## Applications API

Endpoints for managing applications, deployments, environment variables, domains, and lifecycle operations.

### List Applications
**`GET /api/applications`**

List all applications the authenticated user has access to.

Response:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "my-api",
    "description": "Backend API",
    "status": "running",
    "branch": "main",
    "project_id": "660e8400-...",
    "project_name": "Production",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```
Status values: `running`, `done`, `error`, `idle`, `pending`

### Create Application
**`POST /api/applications`**

```json
{
  "name": "my-api",
  "projectId": "660e8400-...",
  "repositoryId": "repo-id",
  "branch": "main",
  "buildType": "nixpacks",
  "serverId": "jAVVJm91DTLB7gzdQvukC",
  "buildPath": "/",
  "description": "My backend API"
}
```

| Field | Required | Description |
|---|---|---|
| name | Yes | Application name |
| projectId | Yes | Project ID |
| repositoryId | Yes | GitHub repository ID |
| branch | No | Git branch (default: main) |
| buildType | No | nixpacks or dockerfile (default: nixpacks) |
| serverId | No | Deploy region server ID |
| buildPath | No | Path to build from (default: /) |
| description | No | Application description |

Response: `{ "id": "550e8400-...", "name": "my-api", "status": "pending" }`

### Get Application
**`GET /api/applications/{id}`**

### Delete Application
**`DELETE /api/applications/{id}`**

Removes the app, its DNS records, and CDN configuration. Admin or owner role required.

### Deploy Application
**`POST /api/applications/{id}/deploy`**

Trigger a new deployment from the configured branch. Admin or owner role required.

### Lifecycle
**`POST /api/applications/{id}/lifecycle`**

```json
{ "action": "start" }
```

| Action | Description |
|---|---|
| start | Start a stopped application |
| stop | Stop a running application |
| reload | Soft restart |
| rebuild | Full rebuild from source |

Admin or owner role required. Fails if organization subscription is suspended.

### Environment Variables

**`GET /api/applications/{id}/environment`** — Get environment variables (returned as newline-separated `KEY=VALUE` string).

**`PUT /api/applications/{id}/environment`** — Update environment variables (replaces all variables).
```json
{ "env": "DATABASE_URL=postgresql://...\nNODE_ENV=production\nPORT=3000" }
```

### Deployments

**`GET /api/applications/{id}/deployments`** — List deployment history. Status values: `done`, `error`, `running`, `queued`.

**`GET /api/applications/{id}/deployments/{deploymentId}/logs`** — Get build logs. For in-progress deployments, returns a Server-Sent Events (SSE) stream.

### AI Fix
**`GET /api/applications/{id}/deployments/{deploymentId}/ai-fix`**

Get AI-generated fix suggestions for a failed deployment. Only works for git-based apps with failed deployments.

Response:
```json
{
  "status": "errors_found",
  "app_name": "my-api",
  "error_summary": "Build failed: missing dependency",
  "root_cause": "Package 'xyz' is listed in imports but not in package.json",
  "suggested_fixes": [
    {
      "file_path": "package.json",
      "action": "modify",
      "description": "Add missing dependency",
      "search_replace": [
        {
          "search": "\"dependencies\": {",
          "replace": "\"dependencies\": {\n  \"xyz\": \"^1.0.0\","
        }
      ]
    }
  ],
  "ai_explanation": "The build failed because..."
}
```

### Domains

**`GET /api/applications/{id}/domains`** — List all domains. Returns domains array and defaultDomain.

**`POST /api/applications/{id}/domains/custom`** — Add a custom domain.
Body: `{ "host": "api.example.com" }`
Response includes `cnameTarget` for DNS setup.

**`DELETE /api/applications/{id}/domains/custom?domainId={domainId}`** — Remove a custom domain. Admin or owner role required.

### Monitoring
**`GET /api/applications/{id}/monitoring`** — Get real-time CPU, memory, and disk usage metrics.

### Analytics
**`GET /api/applications/{id}/analytics?dateFrom={dateFrom}&dateTo={dateTo}&granularity={granularity}`**

Query params: `dateFrom`, `dateTo` (ISO 8601), `granularity` (hour or day, default: day).

Response includes: totalBandwidth, totalRequests, averageResponseTime, requestsChart, bandwidthChart, topCountries, topPaths, errors (3xx/4xx/5xx).

### Purge Cache
**`POST /api/applications/{id}/purge-cache`** — Purge the CDN cache. Admin or owner role required.

---

## Databases API

### List Databases
**`GET /api/databases`**

### Create Database
**`POST /api/databases`**
```json
{
  "name": "mydb",
  "projectId": "660e8400-...",
  "type": "postgresql",
  "serverId": "jAVVJm91DTLB7gzdQvukC",
  "description": "Main database"
}
```

| Field | Required | Description |
|---|---|---|
| name | Yes | Database name |
| projectId | Yes | Project ID |
| type | Yes | postgresql, mysql, mariadb, mongodb, or redis |
| serverId | No | Deploy region server ID |
| description | No | Description |

Passwords and credentials are generated automatically.

### Get Database
**`GET /api/databases/{id}`** — Get database details including connection information.

### Update Database
**`PATCH /api/databases/{id}`** — Update database name or description.

### Delete Database
**`DELETE /api/databases/{id}`** — **Warning: Permanently deletes the database and all data. Cannot be undone.**

### Database Lifecycle
**`POST /api/databases/{id}/{action}`**

Actions: `start`, `stop`, `reload`, `rebuild`, `deploy`

Response:
```json
{ "success": true, "action": "start", "status": "running" }
```
Fails with 403 if organization subscription is suspended.

---

## Projects API

### List Projects
**`GET /api/projects`**

Access types: `organization` (via org membership), `project` (via direct invitation).

### Create Project
**`POST /api/projects`**
```json
{ "name": "Staging", "organizationId": "660e8400-..." }
```
Subject to plan limits on number of projects.

### Get Project
**`GET /api/projects/{id}`** — Returns id, name, organization_id, created_by, created_at, app_count, is_owner, access_type.

### Update Project
**`PUT /api/projects/{id}`** — Update project name. Project creator or organization owner only.

### Delete Project
**`DELETE /api/projects/{id}`** — The project must have no applications.

### Project Members

**`GET /api/projects/{id}/members`** — List members and pending invitations. Roles: `admin`, `viewer`. Statuses: `pending`, `active`, `expired`.

**`POST /api/projects/{id}/members`** — Invite a member. Project/org owner only. Invitations expire after 24 hours.
```json
{ "email": "bob@example.com", "role": "viewer" }
```

**`PUT /api/projects/{id}/members/{memberId}`** — Update a member's role.

**`DELETE /api/projects/{id}/members/{memberId}`** — Remove a member.

---

# MCP (AI INTEGRATION)

## MCP Integration Overview

CranL includes a hosted Model Context Protocol (MCP) server. Connect your IDE to `https://app.cranl.com/api/mcp` with your API key — no binary or local setup needed.

The server exposes **16 tools** for deploying apps, creating databases, managing environment variables, viewing logs, and more.

**Supported IDEs:** Claude Code, Cursor, Windsurf, VS Code (with MCP extension), any MCP-compatible IDE.

**Quick Start:**
1. Get an API key from Settings
2. Add the MCP configuration to your IDE (see IDE Setup)
3. Start using CranL tools from your AI assistant

Tip: Run `cranl mcp` to see ready-to-copy configuration with your API key pre-filled.

**Security:** All requests require a valid API key via `Authorization: Bearer` header. HTTPS only. Rate limited to 120 requests/minute per key.

---

## IDE Setup

Connect your AI IDE to CranL's hosted MCP server. No local binary or setup needed.

**Prerequisites:** A CranL account with an API key (get one from Settings).

### Claude Code
Add to your project's `.mcp.json` or global `~/.claude.json`:
```json
{
  "mcpServers": {
    "cranl": {
      "type": "http",
      "url": "https://app.cranl.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cranl_sk_YOUR_API_KEY"
      }
    }
  }
}
```

Or via CLI:
```
claude mcp add --transport http cranl https://app.cranl.com/api/mcp \
  --header "Authorization: Bearer cranl_sk_YOUR_API_KEY"
```

### Cursor
Add to `.cursor/mcp.json` in your project:
```json
{
  "mcpServers": {
    "cranl": {
      "type": "http",
      "url": "https://app.cranl.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cranl_sk_YOUR_API_KEY"
      }
    }
  }
}
```

### VS Code
Add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "cranl": {
      "type": "http",
      "url": "https://app.cranl.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cranl_sk_YOUR_API_KEY"
      }
    }
  }
}
```

### Antigravity
Open Additional Options (...) > MCP Servers > View raw config:
```json
{
  "mcpServers": {
    "cranl": {
      "serverUrl": "https://app.cranl.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cranl_sk_YOUR_API_KEY"
      }
    }
  }
}
```

### Windsurf
Add to `.windsurf/mcp.json`:
```json
{
  "mcpServers": {
    "cranl": {
      "type": "http",
      "url": "https://app.cranl.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cranl_sk_YOUR_API_KEY"
      }
    }
  }
}
```

### Troubleshooting

**"Unauthorized" error:**
- The key must start with `cranl_sk_`
- The Authorization header must be `Bearer cranl_sk_...` (with the Bearer prefix)
- The key hasn't been revoked in Settings

**"Does not adhere to MCP server configuration schema":**
Make sure the config includes `"type": "http"` inside the server object.

**Tools not showing up:**
Restart your IDE after adding the MCP configuration. Some IDEs require a full restart to discover new MCP servers.

---

## MCP Tools Reference

The CranL MCP server exposes 16 tools that AI assistants can use to manage your infrastructure.

### Projects

**`cranl_list_projects`** — List all projects the user has access to.
- Parameters: None
- Returns: Array of projects with id, name, organization_id, created_at.

### Apps

**`cranl_list_apps`** — List all applications with name, status, branch, project, and ID.
- Parameters: None

**`cranl_create_app`** — Create a new application from a GitHub repository.

| Parameter | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | Application name |
| projectId | string | Yes | Project ID |
| repositoryId | string | Yes | GitHub repository ID |
| branch | string | No | Git branch (default: main) |
| buildType | string | No | nixpacks or dockerfile (default: nixpacks) |
| region | string | No | Deploy region ID (e.g. germany-1, us-east-1) |

**`cranl_deploy_app`** — Trigger a new deployment.
- Parameters: appId (required)

**`cranl_app_lifecycle`** — Start, stop, restart, or rebuild an application.
- Parameters: appId (required), action (required: start/stop/restart/rebuild)

### Logs & Monitoring

**`cranl_get_app_logs`** — Get runtime logs.
- Parameters: appId (required)

**`cranl_get_deployment_logs`** — Get build logs for a specific deployment.
- Parameters: appId (required), deploymentId (required)

**`cranl_get_monitoring`** — Get CPU, memory, and disk monitoring data.
- Parameters: appId (required)
- Returns: Object with cpu, memory, and disk usage data.

**`cranl_get_deployments`** — Get deployment history.
- Parameters: appId (required)
- Returns: Array with id, status, commit_message, commit_sha, created_at.

### Environment Variables

**`cranl_get_env`** — Get environment variables.
- Parameters: appId (required)
- Returns: Object with env field (newline-separated KEY=VALUE pairs).

**`cranl_set_env`** — Set environment variables. Merges with existing — unlisted existing variables are preserved.
- Parameters: appId (required), variables (required) e.g. `{"NODE_ENV": "production", "PORT": "3000"}`

### Databases

**`cranl_create_database`** — Create a managed database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| name | string | Yes | Database name |
| projectId | string | Yes | Project ID |
| type | string | Yes | postgresql, mysql, mariadb, mongodb, or redis |
| region | string | No | Deploy region ID (e.g. germany-1, us-east-1) |

**`cranl_list_databases`** — List all managed databases.
- Parameters: None

### Regions & Domains

**`cranl_list_regions`** — List available deploy regions with server IDs.
- Parameters: None
- Returns:
```json
[
  { "id": "germany-1", "region": "Europe", "server": "Germany 1", "country": "Germany", "available": true },
  { "id": "us-east-1", "region": "USA", "server": "US East 1", "country": "United States", "available": true },
  { "id": "saudi-arabia-1", "region": "MENA", "server": "Saudi Arabia 1", "country": "Saudi Arabia", "available": true, "note": "Pro/Enterprise plan required" }
]
```
Use the `id` field when passing a region to `cranl_create_app` or `cranl_create_database`.

**`cranl_list_domains`** — List domains configured for an application.
- Parameters: appId (required)
- Returns: Array of domain objects with host, https, port, certificateType.

### AI Fix

**`cranl_get_ai_fix`** — Get AI-generated fix suggestions for a failed deployment.
- Parameters: appId (required), deploymentId (required, must be a failed deployment)
- Returns: Object with error_summary, root_cause, suggested_fixes, and ai_explanation.

### MCP Resource

**`cranl://platform-info`** — A read-only resource that provides platform documentation to AI assistants.

Content includes: available database types, deploy regions with server IDs, build types (Nixpacks vs Dockerfile), how environment variables work, custom domain setup, connection string injection pattern, and typical deployment workflow.

---

## OpenAPI Specification

The CranL API is described by an OpenAPI 3.0 specification.

**Download:** https://docs.cranl.com/openapi.json

Compatible with: Swagger UI, Postman, Insomnia, OpenAPI code generators.

- **Base URL:** `https://app.cranl.com/api`
- **Authentication:** `Authorization: Bearer cranl_sk_...`

---

*End of CranL Documentation — scraped from https://docs.cranl.com*
