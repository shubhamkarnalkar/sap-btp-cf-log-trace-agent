# Cloud Foundry Container Exit Codes & Signal Reference Matrix

This reference catalog maps Cloud Foundry container exit codes, kernel signals, Diego Cell lifecycle events, and Gorouter status codes to diagnostic root causes and recommended remediation actions.

| Exit Code / Status | Signal / Component | Diagnostic Meaning | Immediate Cloud Foundry Remediation Command |
| :--- | :--- | :--- | :--- |
| **`Exit 0`** | `SIGTERM` / Diego | Clean shutdown initiated by operator, rolling restart, or zero-downtime deploy. | None needed if intentional. Run `cf app <app>` to verify running state. |
| **`Exit 1`** | General Error | Application crashed on startup due to uncaught exception or missing module. | `cf logs <app> --recent` && `cf env <app>` |
| **`Exit 137`** | `SIGKILL` (cgroup OOM) | Container memory ceiling breached; killed by Linux cgroup kernel manager. | `cf scale <app> -m 1G && cf restage <app>` |
| **`Exit 143`** | `SIGTERM` Timeout | Container did not gracefully terminate within drain timeout (default 10-30s). | `cf set-env <app> CF_STOP_TIMEOUT 60 && cf restage <app>` |
| **`Exit 255`** | Fatal Error | Container entrypoint script exited with fatal failure code or missing binary. | `cf logs <app> --recent` (check `Procfile` / start command) |
| **`HTTP 502`** | Ingress `RTR` | Bad Gateway: Gorouter connected to container socket, but container closed it abruptly. | `cf logs <app> --recent && cf restart <app>` |
| **`HTTP 503`** | Ingress `RTR` | Service Unavailable: No healthy container instances registered with Gorouter. | `cf start <app> && cf scale <app> -i 2` |
| **`HTTP 504`** | Ingress `RTR` | Gateway Timeout: Backend processing took longer than Gorouter timeout (60-900s). | Optimize queries or configure `timeout: 180` in manifest. |
| **`Staging Error`** | Droplet Builder | Staging failed due to disk quota exceeded, memory exhaustion, or network timeout. | `cf scale <app> -k 2G` and add `.cfignore` |
| **`Health Timeout`** | Health Monitor | App failed to bind to `0.0.0.0:$PORT` within specified timeout. | `cf set-health-check <app> http --path /health --timeout 180` |

---

## Linux Signals Reference Table for Diego Cells

| Signal Number | Signal Name | Trigger Context in Cloud Foundry |
| :--- | :--- | :--- |
| `9` (128 + 9 = 137) | `SIGKILL` | Sent by Diego cell after memory quota breach or after drain timeout expires. Cannot be trapped by application. |
| `15` (128 + 15 = 143) | `SIGTERM` | Sent by Diego cell when `cf stop`, `cf restart`, or deployment is triggered. Application should drain connections. |
| `1` (128 + 1 = 129) | `SIGHUP` | Terminal or parent process disconnect. |
| `2` (128 + 2 = 130) | `SIGINT` | Interrupt signal (Ctrl+C). |
| `11` (128 + 11 = 139) | `SIGSEGV` | Segmentation fault in compiled binary or native C++ Node.js addon. |
