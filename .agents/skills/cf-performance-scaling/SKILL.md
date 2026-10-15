---
name: cf-performance-scaling
description: >-
  Cloud Foundry resource sizing, memory leak remediation, and auto-scaling resolution playbooks.
  Use when diagnosing out-of-memory (OOM) conditions, CPU throttling, Diego cell resource exhaustion,
  disk quota exceeded errors, Node.js/JVM heap configuration, or configuring SAP BTP Application Autoscaler rules.
---

# Cloud Foundry Resource Sizing, Performance & Auto-Scaling Skill

This skill provides optimization guidelines, memory calculation formulas, and scaling playbooks to resolve performance bottlenecks and resource exhaustion on SAP BTP Cloud Foundry.

---

## 🧭 Performance & Resource Triage Tree

```
Performance or Resource Alert Triggered
  │
  ├─► Memory > 90% or Crash with Exit 137
  │     └─► [Playbook 1: Memory Optimization & Leak Remediation](#1-memory-optimization--leak-remediation)
  │
  ├─► CPU Utilization constantly at 100% / Request Latency Spike
  │     └─► [Playbook 2: CPU Starvation & Diego Cell Throttling](#2-cpu-starvation--diego-cell-throttling)
  │
  ├─► "disk quota exceeded" / /tmp directory full
  │     └─► [Playbook 3: Disk Quota Exhaustion](#3-disk-quota-exhaustion-remediation)
  │
  └─► Traffic spikes causing sporadic 502/503 errors
        └─► [Playbook 4: Dynamic Auto-Scaling & Sizing Policy](#4-dynamic-auto-scaling--sizing-policy)
```

For quick reference formulas and memory calculations, check the [Scaling Matrix Reference](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-performance-scaling/references/scaling-matrix.md).

---

## 🛠️ Performance & Scaling Playbooks

### 1. Memory Optimization & Leak Remediation
- **Diagnostic Signature:**
  - `cf app <app_name>` shows memory usage approaching 100% of quota.
  - Periodic container crashes with `Exit 137`.
- **Root Cause:**
  - V8 (Node.js) or JVM heap memory ceiling was unset or configured higher than container cgroup limit.
  - Event listener leaks, unclosed database cursor streams, or large in-memory buffer allocations.
- **Suggested Resolution:**
  1. Calculate optimal memory ratio:
     - Reserve **25%** of container memory for OS, native libraries, and C++ bindings.
     - Allocate **75%** of container memory to the language runtime heap.
  2. For a 1GB container:
     ```bash
     # Scale container to 1GB
     cf scale <app_name> -m 1G

     # Set Node.js V8 heap ceiling to 768MB (75% of 1024MB)
     cf set-env <app_name> NODE_OPTIONS "--max-old-space-size=768"

     # Or for Java/Spring Boot
     cf set-env <app_name> JAVA_OPTS "-XX:MaxRAMPercentage=75.0"
     ```
  3. Restage application to activate environment settings:
     ```bash
     cf restage <app_name>
     ```

---

### 2. CPU Starvation & Diego Cell Throttling
- **Diagnostic Signature:**
  - `cf app <app_name>` reports CPU % pegged at 100% or above.
  - High response latency and degraded throughput across all incoming requests.
- **Root Cause:**
  - Cloud Foundry Diego cell allocates CPU shares proportionally to container memory quota.
  - A 256MB container receives only 1/4 the CPU shares of a 1024MB container.
  - Intensive synchronous operations (e.g. JSON parsing, encryption, synchronous XML parsing) block the single-threaded Node.js event loop.
- **Suggested Resolution:**
  1. Vertically scale container memory (which proportionally grants additional CPU shares on Diego):
     ```bash
     cf scale <app_name> -m 2G
     ```
  2. Horizontally scale instances to distribute CPU load across multiple cells:
     ```bash
     cf scale <app_name> -i 3
     ```
  3. Identify CPU-bound code using node clinic or flamegraphs:
     - Offload cryptographic or compression workloads to worker threads.
     - Batch process heavy data feeds asynchronously.

---

### 3. Disk Quota Exhaustion Remediation
- **Diagnostic Signature:**
  - Droplet crashes or throws: `ENOSPC: no space left on device` or `disk quota exceeded`.
  - App state reports `disk: 100% of 1G`.
- **Root Cause:**
  - Application writes temporary upload files to `/tmp` without unlinking.
  - Unrotated application logs or extensive core dumps stored inside the container filesystem.
- **Suggested Resolution:**
  1. Scale container disk quota immediately:
     ```bash
     cf scale <app_name> -k 2G
     ```
  2. Clean up temporary files programmatically:
     - Use streaming upload directly to SAP Object Store or AWS S3 rather than buffering to local disk.
     - Stream application logs directly to stdout/stderr (do not write log files to local disk; let Loggregator capture stdout).
  3. Restart app:
     ```bash
     cf restart <app_name>
     ```

---

### 4. Dynamic Auto-Scaling & Sizing Policy
- **Diagnostic Signature:**
  - Sudden traffic spikes cause HTTP 502/503 during peak business hours.
- **Root Cause:**
  - Static single-instance deployment without automated elasticity.
- **Suggested Resolution:**
  1. Bind SAP BTP Application Autoscaler service:
     ```bash
     cf bind-service <app_name> <autoscaler_service_instance>
     ```
  2. Define an autoscaling policy (`autoscaler-policy.json`):
     ```json
     {
       "instance_min_count": 2,
       "instance_max_count": 6,
       "scaling_rules": [
         {
           "metric_type": "responsetime",
           "breach_duration_secs": 120,
           "threshold": 300,
           "operator": ">=",
           "cool_down_secs": 300,
           "adjustment": "+1"
         },
         {
           "metric_type": "memoryutil",
           "breach_duration_secs": 120,
           "threshold": 80,
           "operator": ">=",
           "cool_down_secs": 300,
           "adjustment": "+1"
         }
       ]
     }
     ```
  3. Attach the policy via Autoscaler CLI plugin:
     ```bash
     cf attach-autoscaling-policy <app_name> autoscaler-policy.json
     ```

---

## ⚡ Sizing Calculator Script

Run the automated container sizing and heap limit calculation tool:
```bash
node .agents/skills/cf-performance-scaling/scripts/calculate-cf-sizing.js <target_memory_mb>
```
