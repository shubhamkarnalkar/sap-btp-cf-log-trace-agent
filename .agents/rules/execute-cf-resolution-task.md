---
description: Automatically execute the Cloud Foundry resolution task to add resolution messages to incident discussions when prompted by the user.
always_on: true
---

# Cloud Foundry Incident Resolution Task Execution Rule

Whenever the user prompts to:
- "add messages for resolution of error or warning in cf"
- "add the task which can execute to add the messages for resolution"
- "remediate cloud foundry incident"
- "suggest resolution for container error / crash / OOM"
- "run resolution task"

### Execution Procedure (MCP-First AI Agent Protocol):
1. **Discover Incident via MCP**:
   - Call MCP tool `IncidentService_Incidents_query` (with filter `status eq 'INVESTIGATING' or status eq 'OPEN'`) to discover the active incident.
2. **Inspect Telemetry via MCP**:
   - Call MCP tool `IncidentService_TraceEvents_query` using `incident_ID` to inspect runtime logs, exit codes, component tags, and status codes.
3. **Formulate Prescriptive Resolution (AI Reasoning)**:
   - Reason through the telemetry using the Cloud Foundry Error Resolution Catalog (OOM Exit 137, Gorouter 502/503/504, Process Crash Exit 1/255, Route Mutation, Staging quotas, or Account Lockout).
   - Formulate a prescriptive diagnostic summary and concrete CLI remediation playbook.
4. **Persist Resolution via MCP Server**:
   - Add the resolution message to discussions using MCP tool `IncidentService_Messages_create`.
   - Update the incident status and remediation command using MCP tool `IncidentService_Incidents_update` (or invoke the action `executeResolutionTask` / `suggestResolution`).
5. **Present Findings to Operator**:
   - Present the diagnosed incident, telemetry findings, and exact remediation commands to the user without requiring external runner scripts.
