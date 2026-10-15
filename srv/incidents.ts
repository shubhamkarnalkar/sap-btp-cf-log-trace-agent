import cds from '@sap/cds';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Load default.env file to provide variables for Cloud Foundry API connectivity
dotenv.config({ path: path.resolve(process.cwd(), 'default.env') });
dotenv.config(); // Fallback to standard .env

const LOG = cds.log('cf-log-trace-agent');

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let lastAuthFailTime = 0;
const AUTH_FAIL_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes cooldown if auth fails

/**
 * Retrieves OAuth token using variables from default.env, username/password grant,
 * client credentials, or fallback to active local CF CLI session.
 */
async function getCloudFoundryToken(): Promise<string | null> {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    if (Date.now() - lastAuthFailTime < AUTH_FAIL_COOLDOWN_MS) {
        return null;
    }

    try {
        // 1. Direct Bearer Token from default.env / process.env
        if (process.env.CF_BEARER_TOKEN) {
            LOG.info('Using direct CF_BEARER_TOKEN from default.env');
            cachedToken = process.env.CF_BEARER_TOKEN;
            tokenExpiresAt = Date.now() + 10 * 60 * 1000;
            return cachedToken;
        }

        // 2. CF Username & Password Grant
        if (process.env.CF_USERNAME && process.env.CF_PASSWORD) {
            LOG.info(`Attempting CF OAuth token fetch using Password credentials for ${process.env.CF_USERNAME}...`);
            const tokenUrl = process.env.CF_TOKEN_URL || 'https://login.cf.us10-001.hana.ondemand.com/oauth/token';
            const clientId = process.env.CF_CLIENT_ID || 'cf';
            const clientSecret = process.env.CF_CLIENT_SECRET || '';
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            const params = new URLSearchParams({
                grant_type: 'password',
                username: process.env.CF_USERNAME,
                password: process.env.CF_PASSWORD,
                client_id: clientId
            });

            try {
                const response = await axios.post(tokenUrl, params.toString(), {
                    timeout: 4000,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${authHeader}`
                    }
                });

                if (response.data?.access_token) {
                    LOG.info('Successfully obtained OAuth token using username/password.');
                    cachedToken = response.data.access_token;
                    tokenExpiresAt = Date.now() + (response.data.expires_in ? (response.data.expires_in - 60) * 1000 : 10 * 60 * 1000);
                    return cachedToken;
                }
            } catch (pwdErr: any) {
                const errData = pwdErr.response?.data;
                const errDesc = typeof errData === 'object' ? JSON.stringify(errData) : (errData || pwdErr.message);
                if (errDesc.includes('PASSWORD_LOCKED')) {
                    LOG.error(`Cloud Foundry authentication failed: User account ${process.env.CF_USERNAME} is PASSWORD_LOCKED on SAP BTP.`);
                    lastAuthFailTime = Date.now();
                    return null;
                } else {
                    LOG.warn(`Password token fetch failed: ${errDesc}`);
                }
            }
        }

        // 3. Client Credentials Grant (from default.env or bound credentials)
        const clientId = process.env.CF_CLIENT_ID
            || process.env.XSUAA_CLIENT_ID
            || (cds.env.requires as any)?.auth?.credentials?.clientid
            || (cds.env.requires as any)?.xsuaa?.credentials?.clientid;

        const clientSecret = process.env.CF_CLIENT_SECRET
            || process.env.XSUAA_CLIENT_SECRET
            || (cds.env.requires as any)?.auth?.credentials?.clientsecret
            || (cds.env.requires as any)?.xsuaa?.credentials?.clientsecret;

        if (clientId && clientSecret) {
            const tokenUrl = process.env.CF_TOKEN_URL
                || (process.env.XSUAA_URL ? `${process.env.XSUAA_URL}/oauth/token` : null);

            if (tokenUrl) {
                try {
                    LOG.info('Fetching CF OAuth token using Client Credentials...');
                    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
                    const response = await axios.post(tokenUrl, 'grant_type=client_credentials', {
                        timeout: 4000,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Basic ${authHeader}`
                        }
                    });
                    if (response.data?.access_token) {
                        cachedToken = response.data.access_token;
                        tokenExpiresAt = Date.now() + 10 * 60 * 1000;
                        return cachedToken;
                    }
                } catch (ccErr: any) {
                    LOG.warn('Client credentials token fetch failed:', ccErr.message);
                }
            }
        }

        // 4. Fallback to active local CF CLI session (`cf oauth-token`)
        try {
            LOG.info('Attempting fallback to local CF CLI session (cf oauth-token)...');
            const { stdout } = await execAsync('cf oauth-token', { timeout: 2500 });
            const cliToken = stdout?.trim();
            if (cliToken && cliToken.toLowerCase().startsWith('bearer ')) {
                LOG.info('Successfully retrieved active OAuth token from local CF CLI!');
                cachedToken = cliToken;
                tokenExpiresAt = Date.now() + 5 * 60 * 1000;
                return cachedToken;
            }
        } catch (cliErr: any) {
            LOG.warn('Local CF CLI token fallback not available or not logged in.');
        }

        LOG.warn('No valid token available from default.env, password auth, or CF CLI.');
        lastAuthFailTime = Date.now();
        return null;
    } catch (err: any) {
        LOG.error('Failed to fetch CF token:', err.message || err);
        lastAuthFailTime = Date.now();
        return null;
    }
}

export default cds.service.impl(async function (this: cds.Service) {
    const { Incidents, ImpactedServices, TraceEvents, Messages, Statuses } = this.entities;
    let lastSyncTime = 0;
    let isSyncing = false;
    const SYNC_INTERVAL_MS = 60 * 1000; // Sync at most once per minute

    const syncCloudFoundryTelemetry = async () => {
        if (isSyncing) return;
        isSyncing = true;
        LOG.info('Starting asynchronous Cloud Foundry telemetry synchronization...');

        try {
            const cfApiUrl = process.env.CF_API_URL || 'https://api.cf.us10-001.hana.ondemand.com';
            const token = await getCloudFoundryToken();
            if (!token) {
                LOG.warn('Cloud Foundry API sync skipped: No valid token retrieved.');
                isSyncing = false;
                return;
            }

            const authHeader = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
            const httpHeaders = { Authorization: authHeader };

            // 1. Fetch CF Applications (/v3/apps) outside DB transaction
            let apps: any[] = [];
            try {
                const appsResponse = await axios.get(`${cfApiUrl}/v3/apps`, { headers: httpHeaders, timeout: 4000 });
                apps = appsResponse.data?.resources || [];
                LOG.info(`Fetched ${apps.length} application records from CF /v3/apps.`);
            } catch (appsErr: any) {
                LOG.error('Failed to fetch CF apps:', appsErr.response?.data || appsErr.message);
            }

            // 2. Fetch Cloud Foundry Audit & Activity Logs (/v3/audit_events) outside DB transaction
            let events: any[] = [];
            try {
                const auditResponse = await axios.get(`${cfApiUrl}/v3/audit_events`, { headers: httpHeaders, timeout: 4000 });
                events = auditResponse.data?.resources || [];
                LOG.info(`Fetched ${events.length} audit event logs from CF /v3/audit_events.`);
            } catch (auditErr: any) {
                LOG.error('Failed to fetch CF audit events:', auditErr.response?.data || auditErr.message);
            }

            // 3. Fast Database Upsert
            await cds.tx(async (tx) => {
                for (const app of apps) {
                    let appCategory = 'CF_APP_STATUS';
                    let appStatus = app.state === 'STARTED' ? 'OPEN' : 'INVESTIGATING';
                    let appRootCause = `CF App '${app.name}' lifecycle state is ${app.state} (${app.instances || 1} instance(s) configured).`;
                    let appRemediation = `Application is in ${app.state} state. Monitor runtime health and logs.`;

                    if (app.state === 'CRASHED' || app.state === 'DOWN') {
                        appCategory = 'CF_APP_CRASH';
                        appStatus = 'INVESTIGATING';
                        appRootCause = `Application '${app.name}' has crashed or failed health checks. State: ${app.state}.`;
                        appRemediation = `1. Run 'cf logs ${app.name} --recent' to capture crash stack trace.\n2. Run 'cf events ${app.name}' to inspect exit code (Exit 137=OOM, Exit 1=Process exception).\n3. If OOM, scale memory: 'cf scale ${app.name} -m 1G'.\n4. Restart app: 'cf restart ${app.name}'.`;
                    } else if (app.state === 'STOPPED') {
                        appCategory = 'CF_APP_STOPPED';
                        appStatus = 'INVESTIGATING';
                        appRootCause = `Application '${app.name}' is currently STOPPED.`;
                        appRemediation = `To restore service, run: 'cf start ${app.name}'. Verify route mapping via 'cf routes'.`;
                    }

                    const incidentRecord = {
                        applicationId: app.guid,
                        targetSpace: app.relationships?.space?.data?.guid || process.env.CF_SPACE || 'dev',
                        correlatedRequestId: app.guid,
                        status: appStatus,
                        errorCategory: appCategory,
                        rootCauseStatement: appRootCause,
                        remediationAction: appRemediation,
                        impactedServices: [{ serviceName: app.name, instanceId: app.guid }],
                        traces: [{
                            timestamp: app.updated_at || app.created_at || new Date().toISOString(),
                            component: 'APP',
                            serviceName: app.name,
                            statusCode: app.state === 'STARTED' ? 200 : 503,
                            logLevel: app.state === 'STARTED' ? 'INFO' : 'WARN',
                            message: `CF App ${app.name} lifecycle state is ${app.state}`
                        }],
                        messages: [{ text: `Automatically created from CF app status event for ${app.name} (${app.guid})` }]
                    };

                    const existing = await tx.run(SELECT.one.from(Incidents).where({ correlatedRequestId: app.guid }));
                    if (!existing) {
                        await tx.run(INSERT.into(Incidents).entries(incidentRecord));
                    } else {
                        const preservedStatus = (existing.status === 'Resolution added by Agent' || existing.status === 'RESOLVED')
                            ? existing.status
                            : incidentRecord.status;
                        await tx.run(UPDATE(Incidents).set({
                            applicationId: incidentRecord.applicationId,
                            status: preservedStatus,
                            errorCategory: incidentRecord.errorCategory,
                            targetSpace: incidentRecord.targetSpace,
                            rootCauseStatement: incidentRecord.rootCauseStatement,
                            remediationAction: incidentRecord.remediationAction
                        }).where({ ID: existing.ID }));
                    }
                }

                for (const event of events) {
                    const spaceName = event.target?.type === 'space' ? event.target.name : (process.env.CF_SPACE || 'dev');
                    const actorName = event.actor?.name || 'CF System';
                    const targetName = event.target?.name || event.target?.type || 'CF Resource';
                    const eventType = event.type || 'audit.event';
                    const targetAppId = event.target?.guid || (event.target?.type === 'app' ? event.target?.name : null) || null;

                    let eventCategory = 'CF_AUDIT_LOG';
                    let eventStatus = 'OPEN';
                    let eventLogLevel = 'INFO';
                    let eventRootCause = `CF Audit Event [${eventType}] on ${targetName} by ${actorName}.`;
                    let eventRemediation = `Review audit event record for ${targetName}.`;

                    if (eventType.includes('crash') || eventType.includes('fail')) {
                        eventCategory = 'CF_PROCESS_CRASH';
                        eventStatus = 'INVESTIGATING';
                        eventLogLevel = 'ERROR';
                        eventRootCause = `Process crash or failure event [${eventType}] on ${targetName} triggered by ${actorName}.`;
                        eventRemediation = `1. Run 'cf logs ${targetName} --recent' to capture standard error.\n2. Review exit code in 'cf events ${targetName}'.\n3. Check memory limits or unhandled exceptions, then run 'cf restart ${targetName}'.`;
                    } else if (eventType.includes('delete')) {
                        eventCategory = 'CF_RESOURCE_DELETED';
                        eventStatus = 'INVESTIGATING';
                        eventLogLevel = 'ERROR';
                        eventRootCause = `Resource '${targetName}' (${event.target?.type || 'resource'}) was deleted by ${actorName}.`;
                        eventRemediation = `Verify if deletion was intentional. If unexpected, redeploy via 'cf push' or recreate bound service.`;
                    } else if (eventType === 'audit.app.map-route' || eventType === 'audit.app.unmap-route') {
                        eventCategory = 'CF_ROUTE_MUTATION';
                        eventLogLevel = 'WARN';
                        eventRootCause = `Route configuration modified for '${targetName}' by ${actorName} [${eventType}].`;
                        eventRemediation = `Verify DNS resolution and URL hostname mapping using 'cf routes' and test endpoint reachability.`;
                    } else if (eventType.includes('restage') || eventType.includes('droplet')) {
                        eventCategory = 'CF_APP_RESTAGE';
                        eventLogLevel = 'WARN';
                        eventRootCause = `Application restage or droplet build triggered for '${targetName}' by ${actorName}.`;
                        eventRemediation = `Inspect staging build logs with 'cf logs ${targetName} --recent' and confirm droplets start cleanly.`;
                    } else if (eventType.includes('update') || eventType.includes('start') || eventType.includes('stop')) {
                        eventCategory = 'CF_LIFECYCLE_MUTATION';
                        eventLogLevel = 'WARN';
                        eventRootCause = `Lifecycle modification event [${eventType}] executed on ${targetName} by ${actorName}.`;
                        eventRemediation = `Check current app runtime state: 'cf app ${targetName}' and inspect recent events.`;
                    }

                    const incidentRecord = {
                        applicationId: targetAppId,
                        targetSpace: spaceName,
                        correlatedRequestId: event.guid,
                        status: eventStatus,
                        errorCategory: eventCategory,
                        rootCauseStatement: eventRootCause,
                        remediationAction: eventRemediation,
                        impactedServices: [{ serviceName: targetName, instanceId: event.target?.guid || event.guid }],
                        traces: [{
                            timestamp: event.created_at || new Date().toISOString(),
                            component: (event.target?.type || 'CF').toUpperCase(),
                            serviceName: targetName,
                            statusCode: eventType.includes('delete') ? 404 : (eventType.includes('crash') ? 503 : 200),
                            logLevel: eventLogLevel,
                            message: `[${eventType}] ${targetName} (${event.target?.type || 'resource'}) action by ${actorName}`
                        }],
                        messages: [{
                            text: `CF Audit Log (${event.guid}): Event '${eventType}' performed on target '${targetName}' by actor '${actorName}' at ${event.created_at}.`
                        }]
                    };

                    const existing = await tx.run(SELECT.one.from(Incidents).where({ correlatedRequestId: event.guid }));
                    if (!existing) {
                        await tx.run(INSERT.into(Incidents).entries(incidentRecord));
                    } else {
                        const preservedStatus = (existing.status === 'Resolution added by Agent' || existing.status === 'RESOLVED')
                            ? existing.status
                            : incidentRecord.status;
                        await tx.run(UPDATE(Incidents).set({
                            applicationId: incidentRecord.applicationId,
                            status: preservedStatus,
                            errorCategory: incidentRecord.errorCategory,
                            targetSpace: incidentRecord.targetSpace,
                            rootCauseStatement: incidentRecord.rootCauseStatement,
                            remediationAction: incidentRecord.remediationAction
                        }).where({ ID: existing.ID }));
                    }
                }
            });

            LOG.info('Finished asynchronous Cloud Foundry telemetry synchronization.');
        } catch (error: any) {
            LOG.error('Failed during CF log & trace synchronization:', error.response?.data || error.message || error);
        } finally {
            isSyncing = false;
        }
    };

    // Non-blocking before READ hook: schedules background sync without blocking read queries
    this.before('READ', 'Incidents', async () => {
        if (Date.now() - lastSyncTime < SYNC_INTERVAL_MS) {
            return;
        }
        lastSyncTime = Date.now();
        setImmediate(() => {
            syncCloudFoundryTelemetry().catch(err => LOG.error('Background sync failed:', err.message));
        });
    });

    // Value Help handler for Statuses code list
    const defaultStatuses = [
        { code: 'OPEN', name: 'Open', criticality: 1 },
        { code: 'INVESTIGATING', name: 'Investigating', criticality: 2 },
        { code: 'Resolution added by Agent', name: 'Resolution added by Agent', criticality: 3 },
        { code: 'RESOLVED', name: 'Resolved', criticality: 3 },
        { code: 'CLOSED', name: 'Closed', criticality: 0 }
    ];

    this.on('READ', 'Statuses', async (req: cds.Request, next: Function) => {
        try {
            const results = await next();
            if (Array.isArray(results) && results.length > 0) {
                return results;
            }
        } catch (e) {
            // Fall through to default statuses
        }
        return defaultStatuses;
    });

    // When a message is added by an Agent, automatically transition incident status to 'Resolution added by Agent'
    this.after('CREATE', 'Messages', async (results: any, req: cds.Request) => {
        const msgs = Array.isArray(results) ? results : [results];

        // Check if request originates from an AI Agent / MCP protocol session
        const httpReq = (req as any).http?.req || (req as any).req;
        const headers = httpReq?.headers || req.headers || {};
        const isMcpSession = Boolean(headers['mcp-session-id'] || headers['x-mcp-session-id']);
        const isAgentCaller = req.user?.id === 'agent' || headers['user-agent']?.toLowerCase()?.includes('agent');

        for (const msg of msgs) {
            const incidentId = msg?.incident_ID;
            const text = msg?.text || '';

            // Check if message content has agent diagnostic / resolution markers
            const hasAgentMarker = text.includes('🤖') ||
                                   text.toLowerCase().includes('[ai agent') ||
                                   text.toLowerCase().includes('resolution playbook') ||
                                   text.toLowerCase().includes('resolution added by agent');

            const isAgent = isMcpSession || isAgentCaller || hasAgentMarker;

            if (incidentId && isAgent) {
                LOG.info(`Agent resolution message detected for incident ${incidentId}. Updating status to 'Resolution added by Agent'`);
                await cds.tx(req).run(
                    UPDATE(Incidents).set({ status: 'Resolution added by Agent' }).where({ ID: incidentId })
                );
            } else if (incidentId) {
                LOG.info(`Non-agent message created for incident ${incidentId}. Incident status left unchanged.`);
            }
        }
    });

    /**
     * ========================================================================
     * RESOLUTION TASK EXECUTION ENGINE (Using CF Log & Trace Agent Skills)
     * ========================================================================
     * Diagnoses Cloud Foundry error and warning telemetry based on the authoritative
     * Cloud Foundry Error Resolution Catalog, builds a prescriptive remediation playbook,
     * appends the resolution message into the incident messages/discussions composition,
     * and updates the remediationAction and status fields.
     */
    const executeResolutionTaskEngine = async (
        tx: cds.Transaction,
        incidentId: string,
        userPrompt?: string
    ): Promise<any> => {
        // 1. Fetch incident record
        const incident = await tx.run(SELECT.one.from(Incidents).where({ ID: incidentId }));
        if (!incident) {
            throw new Error(`Incident with ID '${incidentId}' not found.`);
        }

        // 2. Fetch associated telemetry
        const traces = await tx.run(SELECT.from(TraceEvents).where({ incident_ID: incidentId }));
        const services = await tx.run(SELECT.from(ImpactedServices).where({ incident_ID: incidentId }));

        const targetApp = services[0]?.serviceName || incident.applicationId || 'cf-app';
        const spaceName = incident.targetSpace || process.env.CF_SPACE || 'dev';
        const category = incident.errorCategory || 'CF_GENERAL_INCIDENT';
        const rootCause = incident.rootCauseStatement || 'Unspecified runtime error or telemetry event.';

        // 3. Telemetry Signature Matching (from cf-log-trace-agent Skill Catalog)
        let playbookTitle = '';
        let diagnosticSummary = '';
        let severityType: 'CRITICAL ERROR' | 'HIGH ERROR' | 'WARNING' | 'NOTICE' = 'HIGH ERROR';
        let steps: string[] = [];
        let quickFixCli = '';

        const hasExit137 = traces.some((t: any) => t.message?.includes('137') || t.message?.toLowerCase().includes('out of memory'))
            || rootCause.toLowerCase().includes('oom') || rootCause.includes('137');
        const hasExit1 = traces.some((t: any) => t.message?.includes('exit_status: 1') || t.message?.includes('exit status 1'));
        const hasExit143 = traces.some((t: any) => t.message?.includes('143'));
        const has502 = traces.some((t: any) => t.statusCode === 502 || t.message?.includes('502'));
        const has503 = traces.some((t: any) => t.statusCode === 503 || t.message?.includes('503'));
        const has504 = traces.some((t: any) => t.statusCode === 504 || t.message?.includes('504'));
        const hasWarning = traces.some((t: any) => t.logLevel === 'WARN') || category.includes('WARN');
        const isStopped = category === 'CF_APP_STOPPED' || rootCause.toLowerCase().includes('stopped');
        const isDeleted = category === 'CF_RESOURCE_DELETED' || rootCause.toLowerCase().includes('deleted');
        const isRoute = category === 'CF_ROUTE_MUTATION' || rootCause.toLowerCase().includes('route');
        const isRestage = category === 'CF_APP_RESTAGE' || rootCause.toLowerCase().includes('restage');
        const isPasswordLocked = rootCause.includes('PASSWORD_LOCKED') || traces.some((t: any) => t.message?.includes('PASSWORD_LOCKED'));
        const isHanaHibernated = rootCause.toLowerCase().includes('hana') || traces.some((t: any) => (t.message?.includes('ECONNREFUSED') && t.message?.includes('443')) || t.message?.toLowerCase().includes('hana')) || rootCause.toLowerCase().includes('econnrefused');
        const isAuthScope = rootCause.toLowerCase().includes('xsuaa') || rootCause.toLowerCase().includes('scope') || traces.some((t: any) => (t.statusCode === 401 || t.statusCode === 403) && (t.message?.toLowerCase().includes('scope') || t.message?.includes('JWT') || t.message?.includes('XSUAA')));
        const isAsgEgress = rootCause.toLowerCase().includes('egress') || rootCause.toLowerCase().includes('asg') || traces.some((t: any) => t.message?.includes('EHOSTUNREACH'));
        const isDiskExceeded = rootCause.toLowerCase().includes('disk') || rootCause.toLowerCase().includes('enospc') || traces.some((t: any) => t.message?.toLowerCase().includes('disk quota') || t.message?.includes('ENOSPC'));
        const isHealthFlapping = rootCause.toLowerCase().includes('health check') || traces.some((t: any) => t.message?.toLowerCase().includes('health check') || t.message?.toLowerCase().includes('healthcheck'));

        if (hasExit137 || (category === 'CF_APP_CRASH' && rootCause.toLowerCase().includes('memory'))) {
            severityType = 'CRITICAL ERROR';
            playbookTitle = 'Container Out Of Memory (Exit 137) Recovery Playbook';
            diagnosticSummary = `The container '${targetApp}' breached its allocated cgroup memory limit and was terminated by Diego Cell manager (SIGKILL).`;
            steps = [
                `Scale container memory quota immediately: \`cf scale ${targetApp} -m 1G\``,
                `Configure Node.js V8 maximum heap ceiling: \`cf set-env ${targetApp} NODE_OPTIONS "--max-old-space-size=800"\``,
                `Restage application to apply updated memory boundaries: \`cf restage ${targetApp}\``,
                `Inspect memory growth metrics: run \`cf app ${targetApp}\` to ensure RSS stays within limits.`
            ];
            quickFixCli = `cf scale ${targetApp} -m 1G && cf restage ${targetApp}`;
        } else if (isHanaHibernated) {
            severityType = 'CRITICAL ERROR';
            playbookTitle = 'SAP HANA Cloud Hibernation & Connectivity Playbook';
            diagnosticSummary = `Database connection failed for '${targetApp}' on port 443. The SAP HANA Cloud database instance is likely hibernating or stopped.`;
            steps = [
                `Navigate to SAP HANA Cloud Central in BTP Cockpit and resume/start the stopped database instance.`,
                `Wait until the database status transitions to 'RUNNING'.`,
                `Verify service binding: \`cf services\``,
                `Restart application to reconnect connection pools: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf restart ${targetApp}`;
        } else if (isAuthScope) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'XSUAA / OAuth2 Scope & Authorization Playbook';
            diagnosticSummary = `HTTP 401/403 authorization error detected for '${targetApp}'. Token signature verification failed or required scope is missing.`;
            steps = [
                `Update xs-security.json with necessary scope declarations and role templates.`,
                `Update XSUAA service instance: \`cf update-service <xsuaa_service> -c xs-security.json\``,
                `Assign role collection to user in BTP Cockpit under Security > Users.`,
                `Restage application: \`cf restage ${targetApp}\``
            ];
            quickFixCli = `cf restage ${targetApp}`;
        } else if (isAsgEgress) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Application Security Group (ASG) Network Egress Playbook';
            diagnosticSummary = `Outbound HTTPS traffic blocked from container '${targetApp}' (EHOSTUNREACH). Default ASG restricts network egress.`;
            steps = [
                `Inspect current security groups: \`cf security-groups\``,
                `Create public egress definition JSON allowing TCP ports 443/80.`,
                `Bind security group to space: \`cf bind-security-group public_internet ${spaceName}\``,
                `Restart application: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf restart ${targetApp}`;
        } else if (isDiskExceeded) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Container Disk Quota Exhaustion Playbook';
            diagnosticSummary = `Container '${targetApp}' exceeded allocated disk quota (ENOSPC / 100% disk usage).`;
            steps = [
                `Scale container disk quota immediately: \`cf scale ${targetApp} -k 2G\``,
                `Clean up unrotated local logs or /tmp directory buffering.`,
                `Restart container: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf scale ${targetApp} -k 2G && cf restart ${targetApp}`;
        } else if (isHealthFlapping) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Health Check Timeout & Flapping Recovery Playbook';
            diagnosticSummary = `Application '${targetApp}' failed health check within timeout or flapped during container startup.`;
            steps = [
                `Ensure application binds to process.env.PORT on 0.0.0.0.`,
                `Extend health check timeout ceiling: \`cf set-health-check ${targetApp} http --path /health --timeout 180\``,
                `Restart application: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf set-health-check ${targetApp} http --path /health --timeout 180 && cf restart ${targetApp}`;
        } else if (has502) {
            severityType = 'CRITICAL ERROR';
            playbookTitle = 'Gorouter Ingress HTTP 502 Bad Gateway Playbook';
            diagnosticSummary = `Gorouter established a connection to '${targetApp}', but the container unexpectedly closed the socket or crashed mid-request.`;
            steps = [
                `Stream recent runtime crash traces: \`cf logs ${targetApp} --recent\``,
                `Inspect reverse proxy keep-alive settings to exceed Gorouter 900s timeout.`,
                `Restart container to recover healthy socket listener: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf logs ${targetApp} --recent && cf restart ${targetApp}`;
        } else if (has503 || isStopped) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Service Unavailable (HTTP 503 / Stopped App) Playbook';
            diagnosticSummary = `No healthy container instances for '${targetApp}' are registered with Gorouter. Runtime state is ${isStopped ? 'STOPPED' : 'DOWN'}.`;
            steps = [
                `Start or resume application container: \`cf start ${targetApp}\``,
                `Scale horizontally to multi-instance high availability: \`cf scale ${targetApp} -i 2\``,
                `Verify Gorouter routing table: \`cf routes\` and map if missing: \`cf map-route ${targetApp} <domain> --hostname <host>\``
            ];
            quickFixCli = `cf start ${targetApp} && cf scale ${targetApp} -i 2`;
        } else if (has504) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Gorouter HTTP 504 Gateway Timeout Playbook';
            diagnosticSummary = `Operations in '${targetApp}' took longer than the Gorouter timeout threshold (>60-120 seconds).`;
            steps = [
                `Offload synchronous request processing to background queues or SAP Event Mesh.`,
                `Optimize database projections and OData select queries in CAP service handlers.`,
                `Increase manifest timeout parameter if supported: set \`timeout: 180\` in manifest.yml.`
            ];
            quickFixCli = `cf logs ${targetApp} --recent`;
        } else if (isPasswordLocked) {
            severityType = 'CRITICAL ERROR';
            playbookTitle = 'SAP BTP Account Security (PASSWORD_LOCKED) Recovery Playbook';
            diagnosticSummary = `Authentication to SAP Cloud Foundry / IAS was locked due to excessive failed attempts.`;
            steps = [
                `Unlock user account in SAP Cloud Identity Services Administration Console or SAP BTP Cockpit.`,
                `In default.env, migrate from user password to Client Credentials (CF_CLIENT_ID / CF_CLIENT_SECRET) or direct Bearer Token.`,
                `Locally, refresh developer CLI session: \`cf login -a ${process.env.CF_API_URL || 'https://api.cf.us10-001.hana.ondemand.com'} --sso\``
            ];
            quickFixCli = `cf login --sso`;
        } else if (hasExit1 || category === 'CF_PROCESS_CRASH') {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Application Process Crash (Exit 1 / 255) Playbook';
            diagnosticSummary = `The process in '${targetApp}' failed on startup or threw an unhandled exception.`;
            steps = [
                `Capture standard error trace: \`cf logs ${targetApp} --recent\``,
                `Inspect environment variables and backing service bindings: \`cf env ${targetApp}\``,
                `Restart application after fixing configuration: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf logs ${targetApp} --recent && cf restart ${targetApp}`;
        } else if (hasExit143) {
            severityType = 'WARNING';
            playbookTitle = 'Graceful Termination Timeout (Exit 143) Playbook';
            diagnosticSummary = `Application '${targetApp}' took too long to drain connections during rolling restart.`;
            steps = [
                `Increase stop timeout ceiling: \`cf set-env ${targetApp} CF_STOP_TIMEOUT 60\``,
                `Ensure Node.js SIGTERM handlers gracefully close HTTP listeners and database connection pools.`
            ];
            quickFixCli = `cf set-env ${targetApp} CF_STOP_TIMEOUT 60`;
        } else if (isDeleted) {
            severityType = 'HIGH ERROR';
            playbookTitle = 'Resource Deletion & Binding Restoration Playbook';
            diagnosticSummary = `A bound service, route, or dependency for '${targetApp}' was deleted.`;
            steps = [
                `Inspect existing service instances: \`cf services\``,
                `Recreate missing service instance and rebind: \`cf bind-service ${targetApp} <service_name>\``,
                `Restage application to update VCAP_SERVICES environment: \`cf restage ${targetApp}\``
            ];
            quickFixCli = `cf services && cf restage ${targetApp}`;
        } else if (isRoute) {
            severityType = 'WARNING';
            playbookTitle = 'Cloud Foundry Route Configuration Verification Playbook';
            diagnosticSummary = `Route mapping mutation detected for '${targetApp}'. Endpoints may have changed or become unmapped.`;
            steps = [
                `Inspect active route mappings: \`cf routes\``,
                `Verify application mapping: \`cf app ${targetApp}\``,
                `Test public health check endpoint: \`curl -I https://<route-domain>/health\``
            ];
            quickFixCli = `cf routes`;
        } else if (isRestage) {
            severityType = 'WARNING';
            playbookTitle = 'Application Staging & Droplet Build Playbook';
            diagnosticSummary = `Droplet rebuild or app restage triggered for '${targetApp}'.`;
            steps = [
                `Inspect staging build logs: \`cf logs ${targetApp} --recent\``,
                `Confirm droplet builds cleanly without memory exhaustion during npm install.`,
                `Verify application reaches STARTED state: \`cf app ${targetApp}\``
            ];
            quickFixCli = `cf logs ${targetApp} --recent && cf app ${targetApp}`;
        } else if (hasWarning) {
            severityType = 'WARNING';
            playbookTitle = 'Cloud Foundry Runtime Warning Resolution Playbook';
            diagnosticSummary = `Warning event detected for '${targetApp}' in space '${spaceName}'. Root Cause: ${rootCause}`;
            steps = [
                `Inspect recent telemetry logs: \`cf logs ${targetApp} --recent\``,
                `Audit resource consumption: \`cf app ${targetApp}\``,
                `Check event history: \`cf events ${targetApp}\``
            ];
            quickFixCli = `cf logs ${targetApp} --recent`;
        } else {
            severityType = 'NOTICE';
            playbookTitle = `Cloud Foundry Diagnostic & Resolution Playbook (${category})`;
            diagnosticSummary = `Automated telemetry analysis for '${targetApp}' in space '${spaceName}'. Root Cause: ${rootCause}`;
            steps = [
                `Capture recent container crash traces: \`cf logs ${targetApp} --recent\``,
                `Inspect lifecycle audit events: \`cf events ${targetApp}\``,
                `Verify environment bindings: \`cf env ${targetApp}\``,
                `Restart container: \`cf restart ${targetApp}\``
            ];
            quickFixCli = `cf logs ${targetApp} --recent && cf restart ${targetApp}`;
        }

        // 4. Incorporate User Prompt / Intent
        let userIntentBlock = '';
        if (userPrompt && userPrompt.trim().length > 0) {
            userIntentBlock = `\n🎯 **Operator Prompt / Intent:**\n> "${userPrompt.trim()}"\n`;
            const lowerPrompt = userPrompt.toLowerCase();
            if (lowerPrompt.includes('restart') || lowerPrompt.includes('reboot')) {
                steps.unshift(`[Operator Intent] Explicit restart requested: \`cf restart ${targetApp}\``);
                quickFixCli = `cf restart ${targetApp}`;
            } else if (lowerPrompt.includes('scale') || lowerPrompt.includes('memory')) {
                steps.unshift(`[Operator Intent] Scale container quota: \`cf scale ${targetApp} -m 1G\``);
                quickFixCli = `cf scale ${targetApp} -m 1G`;
            } else if (lowerPrompt.includes('log') || lowerPrompt.includes('trace')) {
                steps.unshift(`[Operator Intent] Stream live logs: \`cf logs ${targetApp} --recent\``);
            }
        }

        // 5. Build Formatted Resolution Message for Discussions Composition
        const timestamp = new Date().toISOString();
        const messageLines = [
            `🤖 **[AI Resolution Task Executed via Skills Catalog]**`,
            `### 🛠️ ${playbookTitle}`,
            `**Severity:** \`[${severityType}]\` | **Target Application:** \`${targetApp}\` | **Space:** \`${spaceName}\``,
            `**Error Category:** \`${category}\``,
            `**Root Cause Analysis:** ${rootCause}`,
            userIntentBlock,
            `#### 📋 Prescriptive Remediation Playbook:`,
            ...steps.map((s, idx) => `${idx + 1}. ${s}`),
            ``,
            `#### ⚡ Cloud Foundry CLI Quick-Fix Command:`,
            `\`\`\`bash`,
            quickFixCli,
            `\`\`\``,
            ``,
            `*Resolved via SAP CAP cf-log-trace-agent & Cloud Foundry Skills Catalog at ${timestamp}*`
        ];
        const messageText = messageLines.filter((l) => l !== undefined && l !== null).join('\n');

        // 6. Insert Resolution Message into incident messages composition
        await tx.run(INSERT.into(Messages).entries({
            incident_ID: incidentId,
            text: messageText
        }));

        // 7. Update incident remediationAction and transition status (code execution)
        await tx.run(UPDATE(Incidents).set({
            remediationAction: quickFixCli || steps[0],
            status: incident.status === 'OPEN' ? 'INVESTIGATING' : incident.status
        }).where({ ID: incidentId }));

        LOG.info(`Successfully executed resolution task for incident ${incidentId}. Message added to discussions.`);

        // Return updated Incident record
        return await tx.run(SELECT.one.from(Incidents).where({ ID: incidentId }));
    };

    // ------------------------------------------------------------------------
    // Action: executeResolutionTask (Bound to Incidents entity)
    // ------------------------------------------------------------------------
    this.on('executeResolutionTask', 'Incidents', async (req: cds.Request) => {
        let incidentId = req.data?.incident_ID || req.data?.ID;
        if (!incidentId && req.params && req.params.length > 0) {
            const p = req.params[0] as any;
            incidentId = typeof p === 'object' ? (p.ID || p.id || Object.values(p)[0]) : p;
        }
        const prompt = req.data?.prompt;

        LOG.info(`Executing 'executeResolutionTask' bound action for incident ${incidentId} (Prompt: '${prompt || 'none'}')`);
        if (!incidentId) {
            return req.error(400, 'Incident ID parameter is required.');
        }

        try {
            return await executeResolutionTaskEngine(cds.tx(req), String(incidentId), prompt);
        } catch (err: any) {
            LOG.error('Failed to execute resolution task:', err.message || err);
            return req.error(500, `Failed to execute resolution task: ${err.message || err}`);
        }
    });

    // ------------------------------------------------------------------------
    // Action: suggestResolution (Alias bound to Incidents entity)
    // ------------------------------------------------------------------------
    this.on('suggestResolution', 'Incidents', async (req: cds.Request) => {
        let incidentId = req.data?.incident_ID || req.data?.ID;
        if (!incidentId && req.params && req.params.length > 0) {
            const p = req.params[0] as any;
            incidentId = typeof p === 'object' ? (p.ID || p.id || Object.values(p)[0]) : p;
        }
        const prompt = req.data?.prompt;

        LOG.info(`Executing 'suggestResolution' bound action for incident ${incidentId} (Prompt: '${prompt || 'none'}')`);
        if (!incidentId) {
            return req.error(400, 'Incident ID parameter is required.');
        }

        try {
            return await executeResolutionTaskEngine(cds.tx(req), String(incidentId), prompt);
        } catch (err: any) {
            LOG.error('Failed to execute suggestResolution:', err.message || err);
            return req.error(500, `Failed to execute suggestResolution: ${err.message || err}`);
        }
    });

    // ------------------------------------------------------------------------
    // Action: executeResolutionTaskForIncident (Unbound tool on IncidentService)
    // ------------------------------------------------------------------------
    this.on('executeResolutionTaskForIncident', async (req: cds.Request) => {
        const { incident_ID, prompt } = req.data;
        LOG.info(`Executing 'executeResolutionTaskForIncident' unbound action for incident ${incident_ID} (Prompt: '${prompt || 'none'}')`);

        if (!incident_ID) {
            return req.error(400, 'incident_ID is required.');
        }

        try {
            return await executeResolutionTaskEngine(cds.tx(req), String(incident_ID), prompt);
        } catch (err: any) {
            LOG.error('Failed to execute resolution task for incident:', err.message || err);
            return req.error(500, `Failed to execute resolution task for incident: ${err.message || err}`);
        }
    });

    // ------------------------------------------------------------------------
    // Action: suggestResolutionForIncident (Alias unbound tool on IncidentService)
    // ------------------------------------------------------------------------
    this.on('suggestResolutionForIncident', async (req: cds.Request) => {
        const { incident_ID, prompt } = req.data;
        LOG.info(`Executing 'suggestResolutionForIncident' unbound action for incident ${incident_ID} (Prompt: '${prompt || 'none'}')`);

        if (!incident_ID) {
            return req.error(400, 'incident_ID is required.');
        }

        try {
            return await executeResolutionTaskEngine(cds.tx(req), String(incident_ID), prompt);
        } catch (err: any) {
            LOG.error('Failed to execute suggestResolutionForIncident:', err.message || err);
            return req.error(500, `Failed to execute suggestResolutionForIncident: ${err.message || err}`);
        }
    });
});
