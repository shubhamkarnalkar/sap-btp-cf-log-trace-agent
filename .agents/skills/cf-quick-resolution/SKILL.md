---
name: cf-quick-resolution
description: >-
  Suggests ultra-short, concise Cloud Foundry incident resolutions. Use when the user requests
  a resolution in as short as possible, brief, TL;DR, or compact format, providing only the root cause
  one-liner and the immediate copy-pasteable CF CLI fix command without narrative fluff.
---

# Cloud Foundry Quick Resolution Skill (Ultra-Short / TL;DR)

This skill provides an ultra-compact, rapid-fire incident diagnosis and resolution workflow for Cloud Foundry on SAP BTP. When requested to provide a resolution **"in as short as possible"**, follow this minimal format strictly.

---

## ⚡ Golden Rule: Minimal Overhead

- **Target length**: ≤ 4 lines (under 50 words).
- **No boilerplate**: Omit background theory, verbose intros, and long multi-step prose.
- **Direct action**: Give the exact root cause in 1 line and the single CF CLI command needed to fix it.

### Standard Output Format:
```markdown
🔴 **Root Cause:** <Single concise sentence identifying component + exact error>
⚡ **Quick Fix:** `<Single-line copy-pasteable cf CLI command>`
💡 **Verify:** `<Single-line verification CLI command>`
```

---

## 🚀 Instant Error-to-Fix Lookup Matrix

Match the telemetry signature from `TraceEvents` or `Logs` directly to the instant fix:

| Symptom / Telemetry | 🔴 Root Cause (1 line) | ⚡ Quick Fix Command | 💡 Verify Command |
| :--- | :--- | :--- | :--- |
| **Exit 137 / OOM** | Container exceeded memory quota (Diego cgroup kill). | `cf scale <app> -m 1G` | `cf app <app>` |
| **Exit 1 / Exit 255** | Application process crashed on startup / uncaught exception. | `cf restart <app>` | `cf logs <app> --recent` |
| **Exit 143 / SIGTERM** | Process graceful shutdown exceeded Diego timeout. | `cf v3-set-health-check <app> http --invocation-timeout 30` | `cf restart <app>` |
| **HTTP 502 (Bad Gateway)** | Backend dropped TCP socket or crashed during request. | `cf restart <app>` | `cf app <app>` |
| **HTTP 503 (Unavailable)** | Application is stopped or no healthy container instances. | `cf start <app>` | `cf app <app>` |
| **HTTP 504 (Timeout)** | Request exceeded Gorouter timeout (default 900s). | `cf scale <app> -i 2` | `cf events <app>` |
| **HANA Hibernation / ECONNREFUSED** | SAP HANA Cloud instance entered scheduled hibernation. | `cf update-service <hana-inst> -c '{"data":{"serviceStopped":false}}'` | `cf service <hana-inst>` |
| **XSUAA 401 / JWT Expired** | Expired client credentials or invalid OAuth token binding. | `cf restage <app>` | `cf env <app>` |
| **ASG Egress / EHOSTUNREACH** | Application Security Group (ASG) blocked outbound traffic. | `cf bind-security-group <sg-name> <org> --space <space>` | `cf security-group <sg-name>` |
| **Disk Quota Exceeded (ENOSPC)** | Ephemeral disk quota exhausted by logs or temp files. | `cf scale <app> -k 2G` | `cf app <app>` |
| **Staging / Buildpack Error** | Buildpack compilation failure or memory exhaustion during staging. | `cf scale <app> -m 1G && cf restage <app>` | `cf app <app>` |
| **audit.app.stop** | Application explicitly stopped by operator or CI/CD pipeline. | `cf start <app>` | `cf app <app>` |

---

## 🛠️ MCP Autonomous Action Protocol

When an AI agent is instructed to suggest a resolution in as short as possible via MCP:

1. **Query Log & Telemetry**:
   - `Logservice_Logs_query` (filter `ID eq '<incident_ID>'` or `status eq 'OPEN'`)
   - `Logservice_TraceEvents_query` (filter `incident_ID eq '<incident_ID>'`)

2. **Formulate Concise Payload**:
   Format the discussion note in **3 lines**:
   ```text
   🔴 **Root Cause:** Container OOM kill (Exit Status 137).
   ⚡ **Quick Fix:** `cf scale <app> -m 1G`
   💡 **Verify:** `cf app <app>`
   ```

3. **Persist via MCP**:
   - Call `Logservice_Messages_create`:
     `{ incident_ID: "<ID>", text: "🔴 **Root Cause:** ...\n⚡ **Quick Fix:** `cf scale <app> -m 1G`\n💡 **Verify:** `cf app <app>`" }`
   - Call `Logservice_Logs_update`:
     `{ ID: "<ID>", status: "Resolution added by Agent", remediationAction: "cf scale <app> -m 1G" }`
   *(Or trigger bound action `suggestResolution` with parameter `{ prompt: "as short as possible" }`)*.
