# Case Studies

## ✅ 1. Build an app showing runtime error on Cloud Foundry and automated code-level resolution
* **Scenario:** Application contains an unhandled exception (e.g. division by zero `1 / 0`) in source code (`server.js:24`), causing container crash with `Exit Status 1` on deployment to Cloud Foundry.
* **Sample App:** [`samples/faulty-calc-app/`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/README.md)
  - Buggy source: [`samples/faulty-calc-app/server.js`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/server.js#L24)
  - Reference resolution: [`samples/faulty-calc-app/solution/server.fixed.js`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/solution/server.fixed.js)
  - CF Manifest: [`samples/faulty-calc-app/manifest.yml`](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/manifest.yml)
* **Agent Capabilities:**
  - Extracts the exact source file and line from stack traces (`server.js:24:15`).
  - Pinpoints root cause (unhandled division by zero).
  - Formulates prescriptive code diffs (`if (!count || count === 0) return 0;` or `try...catch` error boundary).
  - Supplies one-liner redeployment command (`Fix server.js:24 && cf push faulty-calc-app`).
  - Supports both full diagnostic report and ultra-short (TL;DR) output modes.
* **Automated Runner / Verification:**
  ```bash
  node scripts/run-case-study-calc-app.js
  ```