# Case Study 1: Faulty Cloud Foundry App with Automated Code Resolution

This sample application demonstrates an unhandled runtime exception (`division by zero` at startup) that causes a Cloud Foundry process to crash with `Exit Status 1`. The SAP CAP `cf-log-trace-agent` automatically intercepts the telemetry, pinpoints the exact file and line number in the source code, and generates the prescriptive code fix (`try...catch` or defensive check).

---

## 💥 The Bug
In [server.js](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/server.js):
```javascript
function calculateTransactionRatio(totalSum, transactionCount) {
    if (transactionCount === 0) {
        throw new Error("Fatal: Unhandled division by zero in calculateTransactionRatio at server.js:24:15");
    }
    return totalSum / transactionCount;
}
```
During startup initialization:
```javascript
const initialRatio = calculateTransactionRatio(sampleSum, initialBatchCount); // initialBatchCount is 0
```
This causes an uncaught exception, crashing the Node.js process and resulting in:
- Diego Cell telemetry: `app instance exited with exit_status: 1`
- Cloud Foundry log: `Fatal: Unhandled division by zero in calculateTransactionRatio at server.js:24:15`

---

## 🤖 Automated Resolution Provided by Agent
The agent detects the stack trace and generates:
1. **Source Location:** `server.js:24:15`
2. **Root Cause:** Unhandled division by zero during startup metric calculation.
3. **Prescriptive Code Fix:**
   ```javascript
   if (!transactionCount || transactionCount === 0) {
       console.warn('[METRICS] Zero transactions detected. Defaulting ratio to 0.');
       return 0;
   }
   ```
4. **Deploy Command:** `cf push faulty-calc-app`

---

## 🛠️ Verification
Run the automated end-to-end simulation from project root:
```bash
node scripts/run-case-study-calc-app.js
```
The fixed reference implementation is in [solution/server.fixed.js](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/samples/faulty-calc-app/solution/server.fixed.js).
