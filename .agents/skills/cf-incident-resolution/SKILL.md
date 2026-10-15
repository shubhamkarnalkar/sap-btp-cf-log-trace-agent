---
name: cf-incident-resolution
description: >-
  Cloud Foundry incident resolution, crash diagnosis, and remediation playbooks for SAP BTP.
  Use when suggesting resolutions for Cloud Foundry container crashes (Exit 137 OOM, Exit 1, Exit 255),
  Gorouter ingress failures (HTTP 502/503/504), health check timeouts, staging buildpack errors,
  or zero-downtime deployment locks.
---

# Cloud Foundry Incident Resolution & Crash Remediation Skill

This skill provides comprehensive diagnostic decision trees, telemetry signature matching, and actionable Cloud Foundry CLI remediation playbooks to resolve application runtime errors and warnings on SAP BTP Cloud Foundry.

---

## 🧭 Diagnostic Decision Tree

When diagnosing a Cloud Foundry application incident or recommending a resolution, follow this triage flow:

```
Telemetry Received (TraceEvents / CF Logs / Audit Events)
  │
  ├─► Exit 137 or "out of memory" / cgroup kill
  │     └─► [Playbook 1: Out of Memory (OOM) Remediation](#1-out-of-memory-oom-crash-exit-137)
  │
  ├─► Exit 1 or Exit 255 (Process Crash / Uncaught Exception)
  │     └─► [Playbook 2: Application Process Failure](#2-application-process-failure-exit-1--exit-255)
  │
  ├─► Exit 143 or SIGTERM Drain Timeout
  │     └─► [Playbook 3: Graceful Termination Timeout](#3-graceful-termination-timeout-exit-143)
  │
  ├─► Health Check Timed Out / Status Flapping
  │     └─► [Playbook 4: Health Check Failure Resolution](#4-health-check-failure-resolution)
  │
  ├─► HTTP 502 Bad Gateway (component: RTR)
  │     └─► [Playbook 5: Gorouter 502 Bad Gateway](#5-gorouter-502-bad-gateway)
  │
  ├─► HTTP 503 Service Unavailable (component: RTR)
  │     └─► [Playbook 6: Gorouter 503 Service Unavailable](#6-gorouter-503-service-unavailable)
  │
  ├─► HTTP 504 Gateway Timeout (component: RTR)
  │     └─► [Playbook 7: Gorouter 504 Gateway Timeout](#7-gorouter-504-gateway-timeout)
  │
  ├─► Staging Failed / Insufficient Disk or Memory
  │     └─► [Playbook 8: Droplet Staging & Buildpack Failure](#8-droplet-staging--buildpack-failures)
  │
  └─► Zero-Downtime Deployment Stuck / Locked
        └─► [Playbook 9: Deployment Rollback & Route Reset](#9-zero-downtime-deployment-locks)
```

For quick reference on all exit codes and Diego signals, consult the [Exit Codes Matrix Reference](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-incident-resolution/references/exit-codes-matrix.md).

---

## 🛠️ Incident Resolution Playbooks

### 1. Out of Memory (OOM) Crash (`Exit 137`)
- **Diagnostic Signature:**
  - `exit_status: 137` or `exit_description: "out of memory"`
  - Diego Cell logs: `cgroup out of memory: Killed process`
  - Memory consumption graph hits 100% quota before crashing.
- **Root Cause:**
  - Container's Resident Set Size (RSS) exceeded memory quota assigned in `manifest.yml`.
  - Node.js or JVM runtime memory heap expanded without a bounded ceiling.
- **Suggested Resolution:**
  1. Scale container memory quota immediately:
     ```bash
     cf scale <app_name> -m 1G
     ```
  2. For Node.js runtimes, set max heap ceiling to 75% of container memory:
     ```bash
     cf set-env <app_name> NODE_OPTIONS "--max-old-space-size=768"
     ```
  3. For Java / Spring Boot runtimes, configure JVM memory limits:
     ```bash
     cf set-env <app_name> JAVA_OPTS "-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
     ```
  4. Restage app to apply environment variables:
     ```bash
     cf restage <app_name>
     ```

---

### 2. Application Process Failure (`Exit 1` / `Exit 255`)
- **Diagnostic Signature:**
  - `exit_status: 1` or `exit_status: 255`
  - Stack trace in `cf logs <app> --recent` showing `MODULE_NOT_FOUND`, `SyntaxError`, or failed DB bootstrap.
- **Root Cause:**
  - Missing environment variable, incompatible buildpack runtime, or unhandled rejection during app initialization.
- **Suggested Resolution:**
  1. Inspect the recent error stream:
     ```bash
     cf logs <app_name> --recent
     ```
  2. Audit environment variables and service bindings:
     ```bash
     cf env <app_name>
     ```
  3. Supply missing configuration or credentials:
     ```bash
     cf set-env <app_name> <CONFIG_KEY> "<CONFIG_VALUE>"
     ```
  4. Restart application:
     ```bash
     cf restart <app_name>
     ```

---

### 3. Graceful Termination Timeout (`Exit 143`)
- **Diagnostic Signature:**
  - Container stops with `exit_status: 143` after a rolling restart or deployment.
  - Diego Cell waited the default drain timeout (10-30s) before sending `SIGKILL`.
- **Root Cause:**
  - Node.js event loop had pending HTTP connections or open database connection pools that did not drain in time.
- **Suggested Resolution:**
  1. Increase Cloud Foundry graceful stop timeout:
     ```bash
     cf set-env <app_name> CF_STOP_TIMEOUT 60
     ```
  2. Implement proper graceful shutdown handler in application code:
     ```javascript
     process.on('SIGTERM', () => {
       server.close(() => process.exit(0));
       setTimeout(() => process.exit(0), 10000).unref();
     });
     ```
  3. Restage app:
     ```bash
     cf restage <app_name>
     ```

---

### 4. Health Check Failure Resolution
- **Diagnostic Signature:**
  - `events` show: `health check failed` or `timed out after 60s`.
  - App state alternates between `starting` and `crashed` (flapping).
- **Root Cause:**
  - Application did not listen on `0.0.0.0:$PORT` within default 60s.
  - HTTP health check endpoint returned non-200 status code (e.g., 500 because DB was not ready).
- **Suggested Resolution:**
  1. Ensure application binds to `process.env.PORT` on `0.0.0.0` (not `127.0.0.1` or static `8080`).
  2. Increase health check timeout for slow initializing applications:
     ```bash
     cf set-health-check <app_name> http --path /health --timeout 180
     ```
  3. Alternatively, fall back to port-based health checking:
     ```bash
     cf set-health-check <app_name> port --timeout 120
     ```
  4. Restart app:
     ```bash
     cf restart <app_name>
     ```

---

### 5. Gorouter 502 Bad Gateway
- **Diagnostic Signature:**
  - Ingress router logs: `component: "RTR"`, `status: 502`.
  - Client receives HTTP 502.
- **Root Cause:**
  - Gorouter connected to the container port, but the app dropped the TCP connection or crashed while generating response.
- **Suggested Resolution:**
  1. Stream recent logs to identify mid-flight uncaught exceptions:
     ```bash
     cf logs <app_name> --recent
     ```
  2. Ensure Node.js HTTP keep-alive timeout is greater than Gorouter's keep-alive timeout (default 900s):
     ```javascript
     server.keepAliveTimeout = 905000;
     server.headersTimeout = 906000;
     ```
  3. Restart app:
     ```bash
     cf restart <app_name>
     ```

---

### 6. Gorouter 503 Service Unavailable
- **Diagnostic Signature:**
  - Ingress router logs: `component: "RTR"`, `status: 503`.
  - Header: `X-Cf-RouterError: unknown_route` or `endpoint_failure`.
- **Root Cause:**
  - No healthy instances are registered in Gorouter's routing table (all instances crashed, app is `STOPPED`, or route unmapped).
- **Suggested Resolution:**
  1. Start application if stopped:
     ```bash
     cf start <app_name>
     ```
  2. Scale to multiple instances to prevent 0-instance downtime:
     ```bash
     cf scale <app_name> -i 2
     ```
  3. Verify and re-map routes:
     ```bash
     cf routes
     cf map-route <app_name> <domain> --hostname <host>
     ```

---

### 7. Gorouter 504 Gateway Timeout
- **Diagnostic Signature:**
  - Router logs: `component: "RTR"`, `status: 504`, `response_time >= 60.000` or `response_time >= 900.000`.
- **Root Cause:**
  - Backend request took longer than Gorouter timeout (synchronous heavy database query or external API call).
- **Suggested Resolution:**
  1. Offload long-running tasks to asynchronous background jobs (e.g. SAP Event Mesh, message queues).
  2. Optimize database queries with proper indexing and OData `$select` projections.
  3. If supported by route service or Gorouter config, increase manifest timeout:
     ```yaml
     timeout: 180
     ```

---

### 8. Droplet Staging & Buildpack Failures
- **Diagnostic Signature:**
  - `cf push` fails with: `staging failed: Insufficient resources` or `No buildpack could be detected`.
- **Root Cause:**
  - App droplet size exceeded staging disk quota (often due to unignored `.git` or local `node_modules`).
  - Staging container ran out of memory compiling native dependencies.
- **Suggested Resolution:**
  1. Add a `.cfignore` file to exclude unnecessary assets:
     ```text
     node_modules/
     .git/
     .agents/
     test/
     docs/
     ```
  2. Scale disk quota:
     ```bash
     cf scale <app_name> -k 2G
     ```
  3. Set staging memory allocation in `manifest.yml`:
     ```yaml
     staging_memory: 2048M
     ```

---

### 9. Zero-Downtime Deployment Locks
- **Diagnostic Signature:**
  - `cf v3-zdt-push` or rolling deployment hangs or reports: `A deployment is already in progress`.
- **Root Cause:**
  - Previous deployment crashed during instance startup, leaving the deployment task in `PAUSED` or `DEPLOYING` state.
- **Suggested Resolution:**
  1. Check active deployments:
     ```bash
     cf deployments <app_name>
     ```
  2. Cancel or roll back stuck deployment:
     ```bash
     cf cancel-deployment <app_name>
     ```
  3. Restage or push single-instance clean deployment:
     ```bash
     cf push <app_name> --strategy rolling
     ```

---

## ⚡ Execution Script

Run the automated diagnostic utility to inspect any CF application:
```bash
node .agents/skills/cf-incident-resolution/scripts/diagnose-cf-app.js <app_name>
```
