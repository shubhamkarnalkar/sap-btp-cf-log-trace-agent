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
- "suggest resolution in as short as possible"
- "quick resolution"

### Execution Procedure (MCP-First AI Agent Protocol):
1. **Discover Incident via MCP**:
   - Call MCP tool `Logservice_Logs_query` (with filter `status eq 'INVESTIGATING' or status eq 'OPEN'`) to discover the active incident.
2. **Inspect Telemetry via MCP**:
   - Call MCP tool `Logservice_TraceEvents_query` using `incident_ID` to inspect runtime logs, exit codes, component tags, and status codes.
3. **Formulate Prescriptive Resolution (AI Reasoning & Specialized Skills)**:
   - Reason through the telemetry using the specialized Cloud Foundry skills:
     - [`cf-quick-resolution`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-quick-resolution/SKILL.md): Ultra-concise, rapid-fire resolution (root cause 1-liner + single copy-pasteable CF CLI fix) when user requests short / TL;DR answers.
     - [`cf-incident-resolution`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-incident-resolution/SKILL.md): Container crashes (Exit 137 OOM, Exit 1, Exit 255), Gorouter 502/503/504, health check flapping, and staging failures.
     - [`cf-service-connectivity`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-service-connectivity/SKILL.md): SAP HANA Cloud hibernation, XSUAA 401s, Destination proxying, and Application Security Groups (ASG) egress.
     - [`cf-performance-scaling`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-performance-scaling/SKILL.md): Node.js / JVM memory calculations, Diego CPU starvation, disk quotas, and AutoScaler policies.
     - [`cf-log-trace-agent`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-log-trace-agent/SKILL.md): Core CAP incident entity schema and MCP lifecycle.
   - Formulate a prescriptive diagnostic summary and concrete CLI remediation playbook.
4. **Persist Resolution via MCP Server**:
   - Add the resolution message to discussions using MCP tool `Logservice_Messages_create`.
   - Update the incident status and remediation command using MCP tool `Logservice_Logs_update` (or invoke the action `executeResolutionTask` / `suggestResolution`).
5. **Present Findings to Operator**:
   - Present the diagnosed incident, telemetry findings, and exact remediation commands to the user without requiring external runner scripts.
