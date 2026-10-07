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
    const { Incidents } = this.entities;

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
                    LOG.info(`Creating incident record for CF app: ${app.name} (${app.guid})`);
                    const incidentRecord = {
                        targetSpace: app.relationships?.space?.data?.guid || process.env.CF_SPACE || 'dev',
                        correlatedRequestId: app.guid,
                        status: app.state === 'STARTED' ? 'OPEN' : 'INVESTIGATING',
                        errorCategory: 'CF_APP_STATUS',
                        rootCauseStatement: `CF App State: ${app.state}, Total Instances: ${app.instances || 1}`,
                        remediationAction: `Inspect logs and traces for app ${app.name}`,
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
                            { text: `Automatically created from CF app status event for ${app.name} (${app.guid})` }
                        ]
                    };

                    await cds.tx(req).run(UPSERT.into(Incidents).entries(incidentRecord));
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

                    let logLevel = 'INFO';
                    let status = 'OPEN';
                    if (eventType.includes('delete') || eventType.includes('crash') || eventType.includes('fail')) {
                        logLevel = 'ERROR';
                        status = 'INVESTIGATING';
                    } else if (eventType.includes('update') || eventType.includes('start')) {
                        logLevel = 'WARN';
                    }

                    const incidentRecord = {
                        targetSpace: spaceName,
                        correlatedRequestId: event.guid,
                        status: status,
                        errorCategory: 'CF_AUDIT_LOG',
                        rootCauseStatement: `CF Audit Log [${eventType}] on ${targetName} by ${actorName}`,
                        remediationAction: `Review audit event details for ${targetName}`,
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
                                statusCode: eventType.includes('delete') ? 404 : 200,
                                logLevel: logLevel,
                                message: `[${eventType}] ${targetName} (${event.target?.type || 'resource'}) action by ${actorName}`
                            }
                        ],
                        messages: [
                            {
                                text: `CF Audit Log (${event.guid}): Event '${eventType}' performed on target '${targetName}' (guid: ${event.target?.guid || 'N/A'}) by actor '${actorName}' at ${event.created_at}.`
                            }
                        ]
                    };

                    await cds.tx(req).run(UPSERT.into(Incidents).entries(incidentRecord));
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
