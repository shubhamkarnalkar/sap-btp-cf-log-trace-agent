import cds from '@sap/cds';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';

// Load default.env file to provide variables for Cloud Foundry API connectivity
dotenv.config({ path: path.resolve(process.cwd(), 'default.env') });
dotenv.config(); // Fallback to standard .env

const LOG = cds.log('cf-log-trace-agent');

/**
 * Retrieves OAuth token using variables from default.env, username/password grant,
 * client credentials, or fallback to active local CF CLI session.
 */
async function getCloudFoundryToken(): Promise<string | null> {
    try {
        // 1. Direct Bearer Token from default.env / process.env
        if (process.env.CF_BEARER_TOKEN) {
            LOG.info('Using direct CF_BEARER_TOKEN from default.env');
            return process.env.CF_BEARER_TOKEN;
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
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${authHeader}`
                    }
                });

                if (response.data?.access_token) {
                    LOG.info('Successfully obtained OAuth token using username/password.');
                    return response.data.access_token;
                }
            } catch (pwdErr: any) {
                const errData = pwdErr.response?.data;
                const errDesc = typeof errData === 'object' ? JSON.stringify(errData) : (errData || pwdErr.message);
                if (errDesc.includes('PASSWORD_LOCKED')) {
                    LOG.error(`Cloud Foundry authentication failed: User account ${process.env.CF_USERNAME} is PASSWORD_LOCKED on SAP BTP.`);
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
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Basic ${authHeader}`
                        }
                    });
                    if (response.data?.access_token) return response.data.access_token;
                } catch (ccErr: any) {
                    LOG.warn('Client credentials token fetch failed:', ccErr.message);
                }
            }
        }

        // 4. Fallback to active local CF CLI session (`cf oauth-token`)
        try {
            LOG.info('Attempting fallback to local CF CLI session (cf oauth-token)...');
            const cliToken = execSync('cf oauth-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            if (cliToken && cliToken.toLowerCase().startsWith('bearer ')) {
                LOG.info('Successfully retrieved active OAuth token from local CF CLI!');
                return cliToken;
            }
        } catch (cliErr: any) {
            LOG.warn('Local CF CLI token fallback not available or not logged in.');
        }

        LOG.warn('No valid token available from default.env, password auth, or CF CLI.');
        return null;
    } catch (err: any) {
        LOG.error('Failed to fetch CF token:', err.message || err);
        return null;
    }
}

export default cds.service.impl(async function (this: cds.Service) {
    const { Incidents, ImpactedServices, TraceEvents, Messages } = this.entities;

    this.before('READ', 'Incidents', async (req: cds.Request) => {
        LOG.info('Triggering log & trace sync from Cloud Foundry before reading Incidents...');

        try {
            const cfApiUrl = process.env.CF_API_URL || 'https://api.cf.us10-001.hana.ondemand.com';
            LOG.info(`Targeting Cloud Foundry API URL: ${cfApiUrl}`);

            const token = await getCloudFoundryToken();
            if (!token) {
                LOG.error('Cloud Foundry API sync skipped: No valid token retrieved.');
                return;
            }

            const authHeader = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
            const httpHeaders = { Authorization: authHeader };

            // 1. Fetch CF Applications (/v3/apps)
            try {
                const appsResponse = await axios.get(`${cfApiUrl}/v3/apps`, { headers: httpHeaders });
                const apps = appsResponse.data?.resources || [];
                LOG.info(`Fetched ${apps.length} application records from CF /v3/apps.`);

                for (const app of apps) {
                    LOG.info(`Creating/updating incident record for CF app: ${app.name} (${app.guid})`);

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
                        impactedServices: [
                            {
                                serviceName: app.name,
                                instanceId: app.guid
                            }
                        ],
                        traces: [
                            {
                                timestamp: app.updated_at || app.created_at || new Date().toISOString(),
                                component: 'APP',
                                serviceName: app.name,
                                statusCode: app.state === 'STARTED' ? 200 : 503,
                                logLevel: app.state === 'STARTED' ? 'INFO' : 'WARN',
                                message: `CF App ${app.name} lifecycle state is ${app.state}`
                            }
                        ],
                        messages: [
                            {
                                text: `Automatically created from CF app status event for ${app.name} (${app.guid})`
                            }
                        ]
                    };

                    const existing = await cds.tx(req).run(SELECT.one.from(Incidents).where({ correlatedRequestId: app.guid }));
                    if (!existing) {
                        await cds.tx(req).run(INSERT.into(Incidents).entries(incidentRecord));
                    } else {
                        await cds.tx(req).run(UPDATE(Incidents).set({
                            applicationId: incidentRecord.applicationId,
                            status: incidentRecord.status,
                            errorCategory: incidentRecord.errorCategory,
                            targetSpace: incidentRecord.targetSpace,
                            rootCauseStatement: incidentRecord.rootCauseStatement,
                            remediationAction: incidentRecord.remediationAction
                        }).where({ ID: existing.ID }));

                        const existingServices = await cds.tx(req).run(SELECT.from(ImpactedServices).where({ incident_ID: existing.ID }));
                        if (existingServices.length === 0) {
                            for (const svc of incidentRecord.impactedServices) {
                                await cds.tx(req).run(INSERT.into(ImpactedServices).entries({ ...svc, incident_ID: existing.ID }));
                            }
                        }

                        const existingTraces = await cds.tx(req).run(SELECT.from(TraceEvents).where({ incident_ID: existing.ID }));
                        if (existingTraces.length === 0) {
                            for (const tr of incidentRecord.traces) {
                                await cds.tx(req).run(INSERT.into(TraceEvents).entries({ ...tr, incident_ID: existing.ID }));
                            }
                        }

                        const existingMsgs = await cds.tx(req).run(SELECT.from(Messages).where({ incident_ID: existing.ID }));
                        if (existingMsgs.length === 0) {
                            for (const msg of incidentRecord.messages) {
                                await cds.tx(req).run(INSERT.into(Messages).entries({ ...msg, incident_ID: existing.ID }));
                            }
                        }
                    }
                }
            } catch (appsErr: any) {
                LOG.error('Failed to fetch CF apps:', appsErr.response?.data || appsErr.message);
            }

            // 2. Fetch Cloud Foundry Audit & Activity Logs (/v3/audit_events)
            try {
                const auditResponse = await axios.get(`${cfApiUrl}/v3/audit_events`, { headers: httpHeaders });
                const events = auditResponse.data?.resources || [];
                LOG.info(`Fetched ${events.length} audit event logs from CF /v3/audit_events.`);

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
                        impactedServices: [
                            {
                                serviceName: targetName,
                                instanceId: event.target?.guid || event.guid
                            }
                        ],
                        traces: [
                            {
                                timestamp: event.created_at || new Date().toISOString(),
                                component: (event.target?.type || 'CF').toUpperCase(),
                                serviceName: targetName,
                                statusCode: eventType.includes('delete') ? 404 : (eventType.includes('crash') ? 503 : 200),
                                logLevel: eventLogLevel,
                                message: `[${eventType}] ${targetName} (${event.target?.type || 'resource'}) action by ${actorName}`
                            }
                        ],
                        messages: [
                            {
                                text: `CF Audit Log (${event.guid}): Event '${eventType}' performed on target '${targetName}' (guid: ${event.target?.guid || 'N/A'}) by actor '${actorName}' at ${event.created_at}.`
                            }
                        ]
                    };

                    const existing = await cds.tx(req).run(SELECT.one.from(Incidents).where({ correlatedRequestId: event.guid }));
                    if (!existing) {
                        await cds.tx(req).run(INSERT.into(Incidents).entries(incidentRecord));
                    } else {
                        await cds.tx(req).run(UPDATE(Incidents).set({
                            applicationId: incidentRecord.applicationId,
                            status: incidentRecord.status,
                            errorCategory: incidentRecord.errorCategory,
                            targetSpace: incidentRecord.targetSpace,
                            rootCauseStatement: incidentRecord.rootCauseStatement,
                            remediationAction: incidentRecord.remediationAction
                        }).where({ ID: existing.ID }));

                        const existingServices = await cds.tx(req).run(SELECT.from(ImpactedServices).where({ incident_ID: existing.ID }));
                        if (existingServices.length === 0) {
                            for (const svc of incidentRecord.impactedServices) {
                                await cds.tx(req).run(INSERT.into(ImpactedServices).entries({ ...svc, incident_ID: existing.ID }));
                            }
                        }

                        const existingTraces = await cds.tx(req).run(SELECT.from(TraceEvents).where({ incident_ID: existing.ID }));
                        if (existingTraces.length === 0) {
                            for (const tr of incidentRecord.traces) {
                                await cds.tx(req).run(INSERT.into(TraceEvents).entries({ ...tr, incident_ID: existing.ID }));
                            }
                        }

                        const existingMsgs = await cds.tx(req).run(SELECT.from(Messages).where({ incident_ID: existing.ID }));
                        if (existingMsgs.length === 0) {
                            for (const msg of incidentRecord.messages) {
                                await cds.tx(req).run(INSERT.into(Messages).entries({ ...msg, incident_ID: existing.ID }));
                            }
                        }
                    }
                }
            } catch (auditErr: any) {
                LOG.error('Failed to fetch CF audit events:', auditErr.response?.data || auditErr.message);
            }

            LOG.info('Finished syncing Cloud Foundry apps, audit logs, and trace events.');
        } catch (error: any) {
            LOG.error('Failed during CF log & trace synchronization:', error.response?.data || error.message || error);
        }
    });

    this.on('READ', 'Incidents', async (req: cds.Request, next: Function) => {
        return next();
    });
});
