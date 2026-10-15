# Cloud Foundry Sizing Matrix & Memory Calculation Formulas

This reference catalog provides standardized sizing equations, container memory quotas, and runtime configurations for microservices running on Cloud Foundry in SAP BTP.

---

## 1. Runtime Memory Sizing Formulas

### Node.js (V8 Engine)
On Cloud Foundry, the container cgroup memory limit enforces strict termination (`SIGKILL Exit 137`) if the total process memory (Resident Set Size) exceeds the limit.
To prevent the V8 garbage collector from expanding heap into the cgroup kill boundary:

$$\text{V8 Max Old Space Size (MB)} = \text{Container Memory (MB)} \times 0.75$$

| Container Memory Quota | Recommended `NODE_OPTIONS` | Recommended Use Case |
| :--- | :--- | :--- |
| **512 MB** | `--max-old-space-size=384` | Lightweight microservice / API proxy / Gateway router |
| **1024 MB (1 GB)** | `--max-old-space-size=768` | Standard SAP CAP Node.js service with moderate OData operations |
| **2048 MB (2 GB)** | `--max-old-space-size=1536` | Heavy CAP backend processing batch jobs, analytical aggregates, or XLSX exports |
| **4096 MB (4 GB)** | `--max-old-space-size=3072` | High-throughput data ingestion or large memory caching workloads |

---

### Java & Spring Boot (HotSpot / SAP Machine)
Modern JVMs inside Linux containers automatically calculate heap ceiling via container cgroups:

```bash
-XX:MaxRAMPercentage=75.0 -XX:MinRAMPercentage=50.0 -XX:+ExitOnOutOfMemoryError
```

- `-XX:MaxRAMPercentage=75.0`: Restricts Java heap to 75% of container memory, reserving 25% for metaspace, thread stacks, garbage collector structures, and JVM native memory.
- `-XX:+ExitOnOutOfMemoryError`: Triggers container crash upon heap exhaustion, allowing Cloud Foundry health manager to restart instance cleanly instead of hanging.

---

## 2. Horizontal vs Vertical Scaling Trade-Offs

| Sizing Dimension | When to Use | Advantages | Considerations |
| :--- | :--- | :--- | :--- |
| **Horizontal (`cf scale -i N`)** | Stateless REST APIs, web traffic spikes, high concurrency. | Zero-downtime rolling updates, high availability across multiple Diego availability zones. | Backing database connection pool count multiplies by instance count ($N \times \text{pool\_size}$). |
| **Vertical (`cf scale -m XG`)** | In-memory processing, large analytical queries, high Diego CPU share requirements. | Grants higher proportional CPU shares on Diego; prevents OOM during heavy payload serialization. | Requires brief downtime or rolling restart to resize container; higher memory cost per instance. |
