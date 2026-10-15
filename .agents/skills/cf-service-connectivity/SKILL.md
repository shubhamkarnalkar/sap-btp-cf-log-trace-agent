---
name: cf-service-connectivity
description: >-
  Cloud Foundry backing services, SAP BTP connectivity, and authentication incident resolution playbooks.
  Use when diagnosing and resolving SAP HANA Cloud hibernation/disconnects, XSUAA/OAuth2 401 token authentication errors,
  Destination and Connectivity service failures, Application Security Groups (ASG) network egress blocking,
  or corrupted VCAP_SERVICES bindings.
---

# Cloud Foundry Backing Services & BTP Connectivity Resolution Skill

This skill documents diagnostic procedures and resolution playbooks for backing service integration, network egress policies, and identity authentication failures on SAP BTP Cloud Foundry.

---

## 🧭 Backing Services Triage Matrix

```
Connectivity / Service Failure Detected
  │
  ├─► "ECONNREFUSED" / "port 443" / SAP HANA Cloud connection drop
  │     └─► [Playbook 1: SAP HANA Cloud Hibernation Recovery](#1-sap-hana-cloud-hibernation--connection-failure)
  │
  ├─► "401 Unauthorized" / "JWT token is invalid" / "Scope missing" / "PASSWORD_LOCKED"
  │     └─► [Playbook 2: XSUAA / OAuth2 Authentication Failures](#2-xsuaa--oauth2-authentication-failures)
  │
  ├─► "Configuration or network error to destination" / HTTP 503 from Destination
  │     └─► [Playbook 3: SAP BTP Destination Service Connectivity](#3-sap-btp-destination-service-connectivity)
  │
  ├─► "EHOSTUNREACH" / "ETIMEDOUT" connecting to on-premise or external API
  │     └─► [Playbook 4: Application Security Groups (ASG) & Egress Blocking](#4-application-security-groups-asg--egress-blocking)
  │
  └─► Service instance unbound or stale credentials in VCAP_SERVICES
        └─► [Playbook 5: Service Binding Restoration & Restaging](#5-service-binding-restoration--restaging)
```

For deeper service-specific details, see the [BTP Services Playbook Reference](file:///c:/Users/shubhamkar.nalkar/Desktop/Office/BTP/CAP/cf-log-trace-agent/.agents/skills/cf-service-connectivity/references/btp-services-playbook.md).

---

## 🛠️ Connectivity & Service Resolution Playbooks

### 1. SAP HANA Cloud Hibernation & Connection Failure
- **Diagnostic Signature:**
  - CAP or Spring Boot application throws `ECONNREFUSED` or `ETIMEDOUT` when connecting to SAP HANA Cloud host on port `443`.
  - Database status in SAP HANA Central is `STOPPED` / `HIBERNATED`.
- **Root Cause:**
  - SAP HANA Cloud trial and dev instances enter automatic hibernation after hours of inactivity to conserve cloud credits.
- **Suggested Resolution:**
  1. Resume the database instance via SAP BTP Cockpit:
     - Open **SAP HANA Cloud Central** in the BTP Subaccount.
     - Locate the database instance and click **Start** / **Resume**.
  2. Wait until status transitions to **RUNNING**.
  3. Verify the binding status in Cloud Foundry:
     ```bash
     cf services
     ```
  4. Restart the CAP application to re-establish connection pools:
     ```bash
     cf restart <app_name>
     ```

---

### 2. XSUAA / OAuth2 Authentication Failures
- **Diagnostic Signature:**
  - Application returns `HTTP 401 Unauthorized` or `403 Forbidden: Missing required scope`.
  - Log contains: `User account is locked (PASSWORD_LOCKED)` or `JWT token signature verification failed`.
- **Root Cause:**
  - `xs-security.json` lacks necessary roles/scopes or role collection was not assigned to user.
  - Interactive password lock on SAP Cloud Identity Services (IAS) due to brute force or obsolete test credentials.
- **Suggested Resolution:**
  1. For `PASSWORD_LOCKED`:
     - Unlock user account in SAP Cloud Identity Services Administration Console.
     - Switch local/batch scripts to use **Client Credentials** (`CF_CLIENT_ID` / `CF_CLIENT_SECRET`) or **Direct Bearer Token** (`CF_BEARER_TOKEN`) rather than user passwords.
  2. For missing scope / role assignment:
     - Update `xs-security.json` with required scope definition:
       ```json
       {
         "name": "$XSAPPNAME.Display",
         "description": "Read access"
       }
       ```
     - Update the XSUAA service instance:
       ```bash
       cf update-service <xsuaa_service_name> -c xs-security.json
       ```
     - Assign the corresponding Role Collection to the user in BTP Cockpit under **Security > Users**.
     - Restage application:
       ```bash
       cf restage <app_name>
       ```

---

### 3. SAP BTP Destination Service Connectivity
- **Diagnostic Signature:**
  - Microservice throws: `Failed to resolve destination '<dest_name>'` or `503 Service Unavailable: Remote host not found`.
- **Root Cause:**
  - Destination name mismatch between code and BTP Subaccount configuration.
  - Proxy type mismatch (e.g. `OnPremise` without active Cloud Connector or incorrect Location ID).
- **Suggested Resolution:**
  1. Verify destination definition in SAP BTP Cockpit under **Connectivity > Destinations**.
  2. Run destination connection check in BTP Cockpit (**Check Connection** button).
  3. If connecting to on-premise system:
     - Ensure SAP Cloud Connector is online and connected to Subaccount.
     - Ensure `ConnectivityService` is bound to the CF app:
       ```bash
       cf bind-service <app_name> <connectivity_service_instance>
       ```
  4. Restage app to update `VCAP_SERVICES`:
     ```bash
     cf restage <app_name>
     ```

---

### 4. Application Security Groups (ASG) & Egress Blocking
- **Diagnostic Signature:**
  - Application fails with `EHOSTUNREACH` or `connection timeout` when making outbound HTTPS calls to third-party APIs or external services.
- **Root Cause:**
  - Cloud Foundry Application Security Groups (ASGs) by default restrict outbound network egress from Diego containers to internal RFC 1918 / external networks.
- **Suggested Resolution:**
  1. Inspect active security groups bound to the space:
     ```bash
     cf security-groups
     ```
  2. Create an egress rule definition file (`external-egress.json`):
     ```json
     [
       {
         "destination": "0.0.0.0/0",
         "protocol": "tcp",
         "ports": "443,80"
       }
     ]
     ```
  3. Create and bind the security group:
     ```bash
     cf create-security-group public_https external-egress.json
     cf bind-security-group public_https <org> <space>
     ```
  4. Restart application container:
     ```bash
     cf restart <app_name>
     ```

---

### 5. Service Binding Restoration & Restaging
- **Diagnostic Signature:**
  - `VCAP_SERVICES` is missing required keys, or credentials changed on the service broker side.
- **Root Cause:**
  - Service was deleted and recreated without unbinding/rebinding, or app was pushed without restaging.
- **Suggested Resolution:**
  1. Re-bind service instance cleanly:
     ```bash
     cf unbind-service <app_name> <service_instance_name>
     cf bind-service <app_name> <service_instance_name>
     ```
  2. Verify environment bindings:
     ```bash
     cf env <app_name>
     ```
  3. Restage application to inject updated runtime credentials:
     ```bash
     cf restage <app_name>
     ```

---

## ⚡ Verification Script

Run the automated service binding verification script:
```bash
node .agents/skills/cf-service-connectivity/scripts/verify-cf-bindings.js <app_name>
```
