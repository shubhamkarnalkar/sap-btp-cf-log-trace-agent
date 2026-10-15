# SAP BTP Cloud Foundry Log & Trace Incident Agent (`cf-log-trace-agent`)

[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen.svg)](https://nodejs.org/)
[![SAP CAP](https://img.shields.io/badge/SAP%20CAP-%40sap%2Fcds%209-blue.svg)](https://cap.cloud.sap/)
[![Model Context Protocol](https://img.shields.io/badge/Protocol-MCP%20Server-purple.svg)](https://modelcontextprotocol.io/)
[![Cloud Foundry](https://img.shields.io/badge/SAP%20BTP-Cloud%20Foundry%20v3-0070f2.svg)](https://cloudfoundry.org/)

An intelligent observability, incident intelligence, and autonomous AI remediation platform built on the **SAP Cloud Application Programming Model (CAP)** and the **Model Context Protocol (MCP)**. 

The service ingests application lifecycle events (`/v3/apps`) and audit trails (`/v3/audit_events`) from SAP BTP Cloud Foundry, normalizes them into structured incident telemetry, presents a 360° cockpit via **SAP Fiori Elements**, and exposes standard **MCP AI tools** for autonomous agents (Claude, Gemini, Antigravity) to query, diagnose, and remediate incidents in real time.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start & Setup](#-quick-start--setup)
- [Environment Configuration (`default.env`)](#-environment-configuration-defaultenv)
- [4-Tier Authentication Engine](#-4-tier-authentication-engine)
- [Model Context Protocol (MCP) Integration](#-model-context-protocol-mcp-integration)
- [SAP Fiori Elements User Interface](#-sap-fiori-elements-user-interface)
- [Build & Deployment (SAP BTP MTA)](#-build--deployment-sap-btp-mta)
- [Presentation Deck](#-presentation-deck)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## ⚡ Key Features

* **Automated Cloud Foundry Telemetry Ingestion**: Seamless CAP lifecycle hook (`before('READ', 'Incidents')`) that interrogates Cloud Foundry Controller v3 REST APIs on-demand.
* **4-Tier Resilient Authentication**: Automatic token acquisition hierarchy spanning Bearer tokens, Password grant, Client Credentials, and a local `cf oauth-token` developer CLI bridge.
* **Model Context Protocol (MCP) Server**: Full JSON-RPC tool support (`wrap_entities_to_actions`) enabling AI Agents to execute `query`, `get`, `create`, `update`, and `delete` operations without custom API glue code.
* **Relational CDS Incident Schema**: Strongly typed domain entities (`Incidents`, `ImpactedServices`, `TraceEvents`, `Messages`) with composition-based cascading.
* **Enterprise Fiori Elements UX**: Full `@UI` annotations with semantic criticality highlighting (Green / Amber / Red), multi-facet Object Pages, and selection filters.
* **Autonomous Remediation Loop**: AI Agents can read router/cell crash logs, synthesize root causes, and write back remediation action plans directly.

---

## 🏗️ Architecture & Data Flow

```
                      +---------------------------------------+
                      |       SAP BTP Cloud Foundry           |
                      |  - /v3/apps (Lifecycle states)        |
                      |  - /v3/audit_events (Audit history)   |
                      +-------------------+-------------------+
                                          |
                              (OAuth 2.0 / CLI Token)
                                          v
                      +---------------------------------------+
                      |         cf-log-trace-agent            |
                      |  - 4-Tier Token Manager               |
                      |  - Ingestion & Normalization Hook     |
                      |  - SQLite (Dev) / SAP HANA (Prod)     |
                      +-----------+---------------+-----------+
                                  |               |
                         OData V4 |               | Model Context Protocol
                         Protocol |               | (JSON-RPC over HTTP/SSE)
                                  v               v
               +----------------------+       +-------------------------+
               |  SAP Fiori Elements  |       |  Autonomous AI Agents   |
               |  Incident Cockpit    |       |  (Claude, Gemini, etc.) |
               +----------------------+       +-------------------------+
```

---

## 📂 Project Structure

```
cf-log-trace-agent/
├── app/
│   └── annotations.cds       # SAP Fiori Elements UI annotations & criticality
├── db/
│   └── schema.cds            # Domain entities (Incidents, Traces, ImpactedServices, Messages)
├── srv/
│   ├── incidents.cds         # IncidentService CDS definition with @mcp annotations
│   └── incidents.ts          # Core service implementation, 4-tier auth & CF sync pipeline
├── presentation/
│   └── index.html            # Standalone interactive slide deck web application
├── .agents/
│   └── skills/               # Developer agent skills & operational runbooks
├── default.env               # Local environment credentials & CF API configuration
├── mta.yaml                  # SAP BTP Cloud Foundry Multi-Target Application deployment
├── package.json              # CAP & MCP dependencies (@cap-js/mcp, @sap/cds, etc.)
├── PRESENTATION.md           # Master presentation transcript & speaker notes
├── tsconfig.json             # TypeScript compiler configuration
└── README.md                 # Project setup and documentation
```

---

## 📋 Prerequisites

Ensure the following tools are installed on your machine before setting up:

1. **Node.js**: `v20.x` or later (LTS recommended)
   ```bash
   node -v
   ```
2. **SAP CDS Development Kit**:
   ```bash
   npm install -g @sap/cds-dk
   cds -v
   ```
3. **Cloud Foundry CLI** (`v7` or `v8`, optional for local developer token session):
   ```bash
   cf -v
   ```
4. **Cloud MTA Build Tool (MBT)** (for BTP production builds):
   ```bash
   npm install -g mbt
   ```

---

## 🚀 Quick Start & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/shubhamkarnalkar/sap-btp-cf-log-trace-agent.git
cd cf-log-trace-agent
```

### 2. Install Dependencies
Install required CAP, MCP, and Cloud SDK libraries:
```bash
npm install
```
*(If you encounter npm peer dependency warnings between MCP community plugins, run: `npm install --legacy-peer-deps`)*

### 3. Configure Credentials
Review and configure `default.env` (or create a local `.env` file) in the project root:
```ini
# Cloud Foundry Controller Configuration
CF_API_URL=https://api.cf.us10-001.hana.ondemand.com
CF_TOKEN_URL=https://login.cf.us10-001.hana.ondemand.com/oauth/token
CF_USERNAME=your.email@example.com
CF_PASSWORD=YourPasswordHere
CF_ORG=your-btp-org
CF_SPACE=dev

# Optional Direct Token or Bound Credentials
CF_BEARER_TOKEN=
CF_CLIENT_ID=
CF_CLIENT_SECRET=
```

### 4. Verify TypeScript & CDS Compilation
```bash
# Check TypeScript types
npx tsc --noEmit

# Validate CDS service models
npx cds compile srv/incidents.cds
```

### 5. Launch Local Development Server
Start the service in development watch mode:
```bash
cds watch
```
*(or run `npm start` to execute `cds-serve`)*

Once running, navigate to:
* **Service Welcome Page:** [http://localhost:4004](http://localhost:4004)
* **OData V4 Incident Endpoint:** [http://localhost:4004/odata/v4/incident](http://localhost:4004/odata/v4/incident)
* **Model Context Protocol Endpoint:** [http://localhost:4004/mcp](http://localhost:4004/mcp)
* **MCP Health Status:** [http://localhost:4004/mcp/health](http://localhost:4004/mcp/health)

---

## 🔐 Environment Configuration (`default.env`)

The service automatically loads variables from `default.env` via `dotenv`. Key variables include:

| Variable | Required | Description |
|---|---|---|
| `CF_API_URL` | Yes | Target Cloud Foundry API endpoint (e.g., `https://api.cf.us10-001.hana.ondemand.com`) |
| `CF_TOKEN_URL` | Optional | BTP UAA/XSUAA OAuth token endpoint (e.g., `https://login.cf.us10-001.hana.ondemand.com/oauth/token`) |
| `CF_USERNAME` | Optional | BTP user email for Password Grant authentication |
| `CF_PASSWORD` | Optional | User password for Password Grant authentication |
| `CF_BEARER_TOKEN` | Optional | Direct OAuth bearer token (bypasses login flows) |
| `CF_CLIENT_ID` | Optional | OAuth Client ID for Client Credentials flow |
| `CF_CLIENT_SECRET` | Optional | OAuth Client Secret for Client Credentials flow |
| `CF_SPACE` | No | Default Cloud Foundry target space (default: `dev`) |
| `CF_ORG` | No | Target Cloud Foundry organisation |

---

## 🛡️ 4-Tier Authentication Engine

When telemetry synchronization is triggered in [`srv/incidents.ts`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/srv/incidents.ts), `getCloudFoundryToken()` resolves authorization credentials using a robust 4-tier fallback strategy:

1. **Tier 1 — Direct Bearer Token**: Uses `CF_BEARER_TOKEN` if defined (instant, bypasses external token calls).
2. **Tier 2 — Resource Owner Password Grant**: Exchanges `CF_USERNAME` and `CF_PASSWORD` via `CF_TOKEN_URL`. Gracefully detects and reports BTP `PASSWORD_LOCKED` states.
3. **Tier 3 — OAuth 2.0 Client Credentials**: Utilizes `CF_CLIENT_ID` / `CF_CLIENT_SECRET` (or bound XSUAA service keys).
4. **Tier 4 — Local CF CLI Bridge (`cf oauth-token`)**: If running on a developer workstation logged into CF (`cf login`), the service executes `cf oauth-token` through child process execution to inherit the active session with zero manual credential configuration.

---

## 🤖 Model Context Protocol (MCP) Integration

The project integrates `@cap-js/mcp`, `@cap-js/mcp-server`, and `@gavdi/cap-mcp` to expose the CAP service as an MCP Server.

### MCP Configuration in `package.json`
```json
{
  "cds": {
    "mcp": {
      "name": "cf-log-trace-agent-mcp",
      "wrap_entities_to_actions": true,
      "wrap_entity_modes": [
        "query",
        "get",
        "create",
        "update",
        "delete"
      ],
      "instructions": "MCP Server for Cloud Foundry Log & Trace Incident Agent. Enables querying, creating, updating, and deleting incidents, trace events, impacted services, and messages."
    }
  }
}
```

### Auto-Generated AI Tools
When an AI agent inspects `http://localhost:4004/mcp`, it automatically discovers:

| Tool Name | Operation | Description |
|---|---|---|
| `incidents_query` | Query | Filter incidents by `status`, `targetSpace`, `errorCategory` |
| `incidents_get` | Read | Fetch deep incident details and composition children |
| `incidents_update` | Update | Update incident `status`, `rootCauseStatement`, and `remediationAction` |
| `impactedServices_query` | Query | List microservices and instance GUIDs associated with incidents |
| `traceEvents_query` | Query | Query detailed component logs (`RTR`, `CELL`, `APP`) with status codes |
| `messages_create` | Create | Append diagnostic comments or action logs to an incident |

### Connecting to Claude Desktop / MCP Clients
Add the following to your `claude_desktop_config.json` or custom agent MCP configuration:
```json
{
  "mcpServers": {
    "cf-log-trace-agent": {
      "url": "http://localhost:4004/mcp"
    }
  }
}
```

---

## 🖥️ SAP Fiori Elements User Interface

Declarative UI annotations are provided in [`app/annotations.cds`]:

* **Semantic Criticality**: Color-codes incident records automatically:
  * `OPEN` / Positive (3 - Green)
  * `INVESTIGATING` / Critical (2 - Amber)
  * `ERROR` / Negative (1 - Red)
* **Multi-Facet 360° Object Page**:
  * **General Information**: Space, status, root-cause statements, and remediation advice.
  * **Impacted Services**: Embedded microservices table.
  * **Trace & Audit Events**: Chronological log viewer with component tag badges.
  * **Log Messages**: Real-time conversation and operator audit notes.

---

## 📦 Build & Deployment (SAP BTP MTA)

To package and deploy the service to SAP BTP Cloud Foundry:

### 1. Build the Multi-Target Application Archive
```bash
npx mbt build
```
This generates the deployable archive: `mta_archives/cf-log-trace-agent_1.0.0.mtar`.

### 2. Deploy to SAP BTP Cloud Foundry
Ensure you are logged into your target BTP organization and space:
```bash
cf login -a https://api.cf.us10-001.hana.ondemand.com
cf deploy mta_archives/cf-log-trace-agent_1.0.0.mtar
```

---

## 📑 Presentation Deck

An interactive slide deck and speaker runbook are included in this repository:

* **Interactive Slide Deck:** Open [`presentation/index.html`](presentation/index.html) in your browser. Features keyboard navigation (<kbd>→</kbd>/<kbd>←</kbd>), outline drawer (<kbd>M</kbd>), fullscreen mode (<kbd>F</kbd>), speaker notes (<kbd>P</kbd>), and an interactive live simulator.
* **Speaker Script & Deck Transcript:** Detailed slide-by-slide notes and diagrams are available in [`PRESENTATION.md`](PRESENTATION.md).

---

## ❓ Troubleshooting & FAQs

### 1. `Cloud Foundry authentication failed: User account ... is PASSWORD_LOCKED`
* **Cause**: Your SAP BTP user account password has been locked due to consecutive failed login attempts.
* **Remedy**: 
  1. Reset your password in the SAP BTP Cockpit / SAP Universal ID portal.
  2. Alternatively, log in via CF CLI (`cf login --sso`) and the service will automatically fallback to **Tier 4** (`cf oauth-token`), bypassing the password check.

### 2. Port `4004` Already in Use
* Start the CAP server on a different port:
  ```bash
  PORT=4005 cds watch
  ```

### 3. Peer Dependency Warnings on `npm install`
* If installing additional MCP or Cloud SDK plugins:
  ```bash
  npm install --legacy-peer-deps
  ```

## 🤖 Suggest a Resolution Using AI Agent (MCP Server)

The service exposes native **Model Context Protocol (MCP)** endpoints for AI pair programmers (Claude, Gemini, Antigravity) to autonomously diagnose Cloud Foundry container failures.

### Endpoints
* **MCP Primary Gateway**: `http://localhost:4004/mcp` (Protocol: JSON-RPC 2.0 over HTTP / SSE)
* **MCP Health Monitor**: `http://localhost:4004/mcp/health` (Returns `{"status":"UP"}`)
* **IDE Configuration**: Automatically registered via [`.agents/mcp_config.json`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/mcp_config.json)

### Human-in-the-Loop Prompts
To ensure safety in production environments, use the following prompts to have the AI agent inspect telemetry and propose prescriptive playbooks strictly over the MCP protocol:

#### 1. Standard Autonomous Prompt (Next Open Incident)
```text
Diagnose the next open incident strictly using the MCP server. Analyze its telemetry traces, propose a prescriptive resolution playbook as a comment, and verify the status transitions to "Resolution added by Agent" for operator review.
```

#### 2. Explicit SRE Production Prompt (Full Protocol Specification)
Use this prompt if you want zero ambiguity about which MCP tools to invoke:
```text
Perform an autonomous diagnosis for the next active Cloud Foundry incident following these strict requirements:
1. Use ONLY the MCP server tools (IncidentService_Incidents_query, IncidentService_TraceEvents_query, IncidentService_ImpactedServices_query) to fetch telemetry.
2. Formulate a prescriptive remediation playbook (exit codes, cf logs, cf events, scaling, and restart steps) using the cf-log-trace-agent skill catalog.
3. Post the playbook as a discussion comment using the IncidentService_Messages_create MCP tool.
4. Verify that the incident's status automatically transitions to "Resolution added by Agent" upon your message creation.
```

#### 3. Explicit SRE Production Prompt (Targeted Incident UUID)
Use this prompt if you want zero ambiguity about which MCP tools to invoke for a specific incident:
```text
Perform an autonomous diagnosis for incident 099ea6eb-c7c0-4b50-8fb0-ca5412c0f538 following these strict requirements:
1. Use ONLY the MCP server tools (IncidentService_Incidents_query with filter { field: 'ID', op: 'eq', value: '099ea6eb-c7c0-4b50-8fb0-ca5412c0f538' }, IncidentService_TraceEvents_query, IncidentService_ImpactedServices_query) to fetch telemetry.
2. Formulate a prescriptive remediation playbook (exit codes, cf logs, cf events, scaling, and restart steps) using the cf-log-trace-agent skill catalog.
3. Post the playbook as a discussion comment using the IncidentService_Messages_create MCP tool.
4. Verify that the incident's status automatically transitions to "Resolution added by Agent" upon your message creation.
```

### Protocol Flow
1. **Discover**: Agent queries `IncidentService_Incidents_query` strictly via MCP for active incidents.
2. **Inspect**: Agent queries `IncidentService_TraceEvents_query` and `IncidentService_ImpactedServices_query` via MCP.
3. **Reason**: Agent consults the Cloud Foundry Error Resolution Catalog (`cf-log-trace-agent` skill) to formulate a prescriptive playbook.
4. **Propose**: Agent calls `IncidentService_Messages_create` via MCP to append the playbook to discussions.
5. **Auto-Transition**: The service automatically transitions incident status to `"Resolution added by Agent"`.
6. **Verify & Close**: SRE operator inspects the playbook and confirms resolution.

---

## 🧠 Cloud Foundry Autonomous Skills Catalog

The agent workspace includes specialized, modular Cloud Foundry skills under [`.agents/skills/`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills) to empower AI models to diagnose issues and suggest prescriptive resolutions:

| Skill | Directory | Primary Resolution Scope |
| :--- | :--- | :--- |
| **`cf-incident-resolution`** | [`skills/cf-incident-resolution`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-incident-resolution/SKILL.md) | Container crashes (`Exit 137` OOM, `Exit 1`, `Exit 255`), Gorouter ingress (`502`, `503`, `504`), health check timeouts, droplet staging, and zero-downtime deployment locks. Includes [Exit Codes Reference Matrix](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-incident-resolution/references/exit-codes-matrix.md) and [`diagnose-cf-app.js`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-incident-resolution/scripts/diagnose-cf-app.js). |
| **`cf-service-connectivity`** | [`skills/cf-service-connectivity`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-service-connectivity/SKILL.md) | Backing service resolution: SAP HANA Cloud hibernation (`ECONNREFUSED:443`), XSUAA 401/403 scope issues, Destination proxying, Application Security Groups (ASG) network egress, and `VCAP_SERVICES` re-binding. Includes [BTP Services Playbook](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-service-connectivity/references/btp-services-playbook.md) and [`verify-cf-bindings.js`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-service-connectivity/scripts/verify-cf-bindings.js). |
| **`cf-performance-scaling`** | [`skills/cf-performance-scaling`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-performance-scaling/SKILL.md) | Resource sizing and optimization: Node.js V8 heap ceiling (`--max-old-space-size`), JVM container ratios (`-XX:MaxRAMPercentage`), Diego cell CPU starvation, disk quota (`ENOSPC`), and SAP BTP Application Autoscaler policy rules. Includes [Scaling Matrix](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-performance-scaling/references/scaling-matrix.md) and [`calculate-cf-sizing.js`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-performance-scaling/scripts/calculate-cf-sizing.js). |
| **`cf-log-trace-agent`** | [`skills/cf-log-trace-agent`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-log-trace-agent/SKILL.md) | Core CAP incident entity schema, CF API synchronization, Model Context Protocol (MCP) server lifecycle, and status transition rules. |

---

## 📄 License & Maintainers

* **Repository:** `shubhamkarnalkar/sap-btp-cf-log-trace-agent`
* **Maintainer:** Shubhamkar Nalkar
* **License:** UNLICENSED (Internal Enterprise)

