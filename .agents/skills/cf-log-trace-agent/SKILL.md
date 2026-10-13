---
name: cf-log-trace-agent
description: >-
  Guide and procedures for managing, testing, and troubleshooting the SAP CAP Cloud Foundry Log & Trace Agent service.
  Use when working with CF OAuth tokens, syncing /v3/apps and /v3/audit_events, or managing incident telemetry schemas.
---

# SAP CAP Cloud Foundry Log & Trace Agent Skill

This skill documents the architecture, configuration, authentication flows, and synchronization workflows for the `cf-log-trace-agent` SAP CAP service.

---

## 🏗️ Architecture Overview

The `cf-log-trace-agent` service connects to SAP BTP Cloud Foundry APIs to capture application lifecycle events and audit logs, converting them into structured incident telemetry records stored in SAP HANA / SQLite.

### Core Files:
- **Data Model:** [`db/schema.cds`](../../db/schema.cds) (`shubh.incidents` namespace)
  - `Incidents`: Main incident record with `errorCategory`, `rootCauseStatement`, `remediationAction`, `status`.
  - `ImpactedServices`: Associated microservice/app instances.
  - `TraceEvents`: Individual log and trace events (`APP`, `RTR`, `CELL`).
  - `Messages`: Chronological activity messages and comments.
- **Service Definition:** [`srv/incidents.cds`](../../srv/incidents.cds) (`IncidentService`)
- **Service Implementation & Sync:** [`srv/incidents.ts`](../../srv/incidents.ts)
- **Environment Credentials:** `default.env` (loaded dynamically at runtime)

---

## 🔑 Cloud Foundry Authentication Priority

When syncing logs and trace events, `getCloudFoundryToken()` in `srv/incidents.ts` resolves credentials in the following order:

1. **Direct Bearer Token:** `CF_BEARER_TOKEN` in `default.env`
2. **User Password Credentials:** `CF_USERNAME` and `CF_PASSWORD` via `CF_TOKEN_URL`
3. **Client Credentials:** `CF_CLIENT_ID` and `CF_CLIENT_SECRET` via OAuth token URL
4. **Local CF CLI Session Fallback:** Executes `cf oauth-token` to reuse active local developer session

---

## 🔄 Synchronization Workflow

1. **Before READ Handler:** Triggers automatically prior to fetching `Incidents`.
2. **CF Applications API:** Hits `${CF_API_URL}/v3/apps` to query application lifecycle states (`STARTED`, `STOPPED`, `CRASHED`).
3. **CF Audit Events API:** Hits `${CF_API_URL}/v3/audit_events` to retrieve system change audit logs.
4. **Database Persistence:** Uses `UPSERT.into(Incidents)` to record or update telemetry without duplicating incident records.

---

## 🧪 Testing & Verification Commands

```bash
# Test TypeScript compilation
npx tsc --noEmit

# Compile CDS schema
npx cds compile srv/incidents.cds

# Start CAP development watch server
cds w
```
