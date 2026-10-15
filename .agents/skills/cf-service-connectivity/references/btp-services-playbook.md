# SAP BTP Cloud Foundry Backing Services Troubleshooting Playbook

This reference provides in-depth diagnostic signatures and remediation commands for backing services commonly bound to Cloud Foundry applications on SAP Business Technology Platform (BTP).

---

## 1. SAP HANA Cloud (`hana`)

| Diagnostic Sign | Root Cause | Remediation Procedure |
| :--- | :--- | :--- |
| `ECONNREFUSED <host>:443` | Database instance is stopped/hibernating. | Open SAP HANA Cloud Central -> Click Start -> Wait for RUNNING -> `cf restart <app>` |
| `HDBException: authentication failed` | Outdated credentials in `VCAP_SERVICES`. | `cf unbind-service <app> <hana-svc> && cf bind-service <app> <hana-svc> && cf restage <app>` |
| `Connection limit exceeded` | Connection pool leakage in Node.js / Java app. | Set max pool size in CAP (`cds.env.requires.db.pool.max = 10`) or Spring DataSource. |

---

## 2. SAP Authorization & Trust Management (`xsuaa`)

| Diagnostic Sign | Root Cause | Remediation Procedure |
| :--- | :--- | :--- |
| `HTTP 401 Unauthorized` | Invalid JWT signature or token expired. | Ensure application verifies token against current XSUAA URL and client credentials. |
| `HTTP 403 Forbidden` | User or token lacks required application scope. | Update `xs-security.json` -> `cf update-service <xsuaa> -c xs-security.json` -> assign role collection in BTP Cockpit. |
| `PASSWORD_LOCKED` | Account locked on SAP Cloud Identity Services. | Unlock user in IAS Administration Console; switch automated agents to Client Credentials. |

---

## 3. SAP Destination Service (`destination`)

| Diagnostic Sign | Root Cause | Remediation Procedure |
| :--- | :--- | :--- |
| `Destination not found` | Destination name typo or created at wrong subaccount level. | Verify destination in BTP Cockpit under Subaccount -> Connectivity -> Destinations. |
| `Cannot connect to OnPremise system` | SAP Cloud Connector is disconnected or Location ID mismatch. | Check Cloud Connector status in BTP Cockpit; verify `CloudConnectorLocationId` property. |

---

## 4. Application Security Groups (ASG)

To allow an application in Cloud Foundry to access external public APIs (e.g. GitHub, OpenAI, external payment gateways):

1. Check current security groups:
   ```bash
   cf security-groups
   ```
2. Create egress definition `public_egress.json`:
   ```json
   [
     {
       "destination": "0.0.0.0/0",
       "protocol": "tcp",
       "ports": "443,80"
     }
   ]
   ```
3. Bind security group to target space:
   ```bash
   cf create-security-group public_internet public_egress.json
   cf bind-security-group public_internet <org> <space>
   ```
4. Restart application container:
   ```bash
   cf restart <app_name>
   ```
