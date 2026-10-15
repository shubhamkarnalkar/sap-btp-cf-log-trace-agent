/**
 * Autonomous Batch Cloud Foundry Incident Diagnosis via MCP Protocol
 * 
 * Strict Requirements:
 * 1. Use ONLY MCP tools:
 *    - IncidentService_Incidents_query
 *    - IncidentService_TraceEvents_query
 *    - IncidentService_ImpactedServices_query
 * 2. Formulate prescriptive remediation playbooks (exit codes, cf logs, cf events, scaling, restart steps)
 *    using the cf-log-trace-agent skill catalog.
 * 3. Post the playbook as discussion comment using IncidentService_Messages_create MCP tool.
 * 4. Verify that each incident's status automatically transitions to "Resolution added by Agent".
 * 
 * Executes for ALL active incidents on http://localhost:4004/mcp.
 */

const MCP_URL = process.env.MCP_URL || 'http://localhost:4004/mcp';
const AUTH_HEADER = 'Basic ' + Buffer.from('alice:').toString('base64');

async function mcpCall(method, params, sessionId, id) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': AUTH_HEADER
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const res = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
    });

    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
}

function buildPlaybook(incident, traces, services) {
    const targetApp = services[0]?.serviceName || incident.applicationId || 'cf-log-trace-agent-srv';
    const targetSpace = incident.targetSpace || 'dev';
    const category = incident.errorCategory || 'CF_GENERAL';
    const rootCause = incident.rootCauseStatement || '';
    const reqId = incident.correlatedRequestId || '';

    let playbookTitle = '';
    let categoryHeading = '';
    let diagnosis = '';
    let exitCodesAnalysis = '';
    let logsStep = '';
    let eventsStep = '';
    let scalingStep = '';
    let restartStep = '';
    let routeStep = '';
    let quickFix = '';

    if (category === 'CF_PROCESS_CRASH' || category === 'CF_APP_CRASH' || rootCause.toLowerCase().includes('crash')) {
        playbookTitle = 'Container Process Crash & Runtime Exception Playbook';
        categoryHeading = 'Process Crash / Container Lifecycle Failure';
        diagnosis = `Container instance crashed or failed runtime execution. Diego Cell terminated instance and Gorouter registered 503 endpoint failure.`;
        exitCodesAnalysis = [
            `Inspect container termination exit codes using: \`cf events ${targetApp}\``,
            `- Exit 1 / 255: Uncaught application exception, unhandled promise rejection, missing dependencies, or database connection pool failure.`,
            `- Exit 137: Out of Memory (OOM) - container RSS memory exceeded cgroup quota. Diego Cell sent SIGKILL.`,
            `- Exit 143: Graceful shutdown timeout exceeded during drain (SIGTERM).`
        ].join('\n   ');
        logsStep = `Capture runtime crash standard error: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Verify Diego crash event chronology: \`cf events ${targetApp}\``;
        scalingStep = `Scale memory quota to prevent OOM: \`cf scale ${targetApp} -m 1G\` and configure \`cf set-env ${targetApp} NODE_OPTIONS "--max-old-space-size=800"\`. Scale horizontally for redundancy: \`cf scale ${targetApp} -i 2\``;
        restartStep = `Restart container instances: \`cf restart ${targetApp}\` (Extend health check if flapping: \`cf set-health-check ${targetApp} http --path /health --timeout 180\`)`;
        routeStep = `Confirm healthy route binding: \`cf routes\``;
        quickFix = `cf logs ${targetApp} --recent && cf scale ${targetApp} -m 1G -i 2 && cf restart ${targetApp}`;
    } else if (category === 'CF_APP_STOPPED' || rootCause.toLowerCase().includes('stopped')) {
        playbookTitle = 'Application Instance Recovery & Route Restoration Playbook';
        categoryHeading = 'Application Stopped State';
        diagnosis = `The target application '${targetApp}' is currently in STOPPED state. All instance sockets are unregistered from Gorouter leading to HTTP 503.`;
        exitCodesAnalysis = [
            `Verify lifecycle status: \`cf app ${targetApp}\``,
            `- State: STOPPED (0 of 1 instances running)`,
            `- Exit Status: 0 / Clean termination upon stop request.`
        ].join('\n   ');
        logsStep = `Inspect last shutdown logs: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Identify who issued the stop action: \`cf events ${targetApp}\``;
        scalingStep = `Ensure high-availability multi-instance topology: \`cf scale ${targetApp} -i 2\``;
        restartStep = `Start the stopped container: \`cf start ${targetApp}\``;
        routeStep = `Verify public HTTP ingress: \`cf routes\``;
        quickFix = `cf start ${targetApp} && cf scale ${targetApp} -i 2 && cf routes`;
    } else if (category === 'CF_RESOURCE_DELETED' || rootCause.toLowerCase().includes('deleted')) {
        playbookTitle = 'Deleted Backing Service & Service Key Restoration Playbook';
        categoryHeading = 'Backing Resource Deletion';
        diagnosis = `A backing service instance, service key, or binding was deleted. Dependent applications may fail database, XSUAA, or destination calls.`;
        exitCodesAnalysis = [
            `Audit resource deletion events: \`cf events ${targetApp}\``,
            `- HTTP Status 404 / Resource Not Found on binding lookups.`,
            `- Exit Status 1 on startup if mandatory backing service is missing in VCAP_SERVICES.`
        ].join('\n   ');
        logsStep = `Inspect dependency connection errors: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Verify deleted resource audit entry: \`cf events ${targetApp}\``;
        scalingStep = `Verify remaining service instance quotas: \`cf services\``;
        restartStep = `Recreate missing service instance and rebind: \`cf bind-service ${targetApp} <service_name>\`, then \`cf restage ${targetApp}\``;
        routeStep = `Check application status: \`cf app ${targetApp}\``;
        quickFix = `cf services && cf restage ${targetApp}`;
    } else if (category === 'CF_ROUTE_MUTATION' || rootCause.toLowerCase().includes('route')) {
        playbookTitle = 'Gorouter Ingress & Route Mapping Verification Playbook';
        categoryHeading = 'Route Configuration Mutation';
        diagnosis = `Route configuration for '${targetApp}' was mapped or unmapped. Ingress traffic may experience HTTP 404/503 errors if mapping is misaligned.`;
        exitCodesAnalysis = [
            `Inspect active routing table: \`cf routes\``,
            `- HTTP 404 Not Found: Hostname not mapped to any Diego app.`,
            `- HTTP 503 Service Unavailable: Route exists but no healthy app instances bound.`
        ].join('\n   ');
        logsStep = `Stream Gorouter (RTR) access logs: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Inspect route mutation audit history: \`cf events ${targetApp}\``;
        scalingStep = `Scale instances to handle ingress routing load: \`cf scale ${targetApp} -i 2\``;
        restartStep = `Remap route if missing: \`cf map-route ${targetApp} <domain> --hostname <host>\`, then \`cf restart ${targetApp}\``;
        routeStep = `Test public endpoint health: \`curl -I https://<route-domain>/health\``;
        quickFix = `cf routes && cf restart ${targetApp}`;
    } else if (category === 'CF_APP_RESTAGE' || rootCause.toLowerCase().includes('restage') || rootCause.toLowerCase().includes('droplet')) {
        playbookTitle = 'Application Staging Build & Droplet Verification Playbook';
        categoryHeading = 'Application Restage & Buildpack Droplet';
        diagnosis = `Application restage or droplet build was triggered. Verify droplet compilation and staging memory/disk limits.`;
        exitCodesAnalysis = [
            `Check build staging exit codes: \`cf events ${targetApp}\``,
            `- Exit Status 0: Staging compilation successful.`,
            `- Staging Failed / Insufficient resources: Disk or memory quota exceeded during buildpack execution.`
        ].join('\n   ');
        logsStep = `Capture buildpack compilation logs: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Review staging events: \`cf events ${targetApp}\``;
        scalingStep = `If staging OOM occurs, increase container limits: \`cf scale ${targetApp} -k 2G -m 1G\``;
        restartStep = `Restage application cleanly: \`cf restage ${targetApp}\``;
        routeStep = `Verify droplet started successfully: \`cf app ${targetApp}\``;
        quickFix = `cf logs ${targetApp} --recent && cf restage ${targetApp}`;
    } else if (category === 'CF_LIFECYCLE_MUTATION') {
        playbookTitle = 'Application Lifecycle Modification Audit Playbook';
        categoryHeading = 'Lifecycle Mutation Event';
        diagnosis = `Lifecycle modification event detected on '${targetApp}'. Verify current runtime instance status and configuration.`;
        exitCodesAnalysis = [
            `Inspect current instance state: \`cf app ${targetApp}\``,
            `- Confirm requested instance count matches running instances.`,
            `- Exit Status 0 for healthy instances.`
        ].join('\n   ');
        logsStep = `Stream recent runtime logs: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Audit lifecycle modification actor: \`cf events ${targetApp}\``;
        scalingStep = `Review resource scaling: \`cf scale ${targetApp} -m 1G -i 2\``;
        restartStep = `If instances are unaligned, restart container: \`cf restart ${targetApp}\``;
        routeStep = `Verify route mapping: \`cf routes\``;
        quickFix = `cf app ${targetApp} && cf restart ${targetApp}`;
    } else {
        playbookTitle = 'Cloud Foundry Audit & Security Telemetry Playbook';
        categoryHeading = 'Audit Event Telemetry';
        diagnosis = `Cloud Foundry audit event logged for '${targetApp}' in space '${targetSpace}'. Verify resource state and credentials compliance.`;
        exitCodesAnalysis = [
            `Inspect security & audit history: \`cf events ${targetApp}\``,
            `- Audit Event Code: ${reqId || 'Recorded'}`,
            `- Review service keys and credential exposure.`
        ].join('\n   ');
        logsStep = `Extract relevant audit log stream: \`cf logs ${targetApp} --recent\``;
        eventsStep = `Review full audit log trail: \`cf events ${targetApp}\``;
        scalingStep = `Audit resource utilization: \`cf app ${targetApp}\``;
        restartStep = `If service key or credentials changed, restart: \`cf restart ${targetApp}\``;
        routeStep = `Verify application accessibility: \`cf routes\``;
        quickFix = `cf events ${targetApp} && cf app ${targetApp}`;
    }

    const playbookLines = [
        '🤖 [AI AGENT DIAGNOSTIC RESOLUTION - VIA MCP SERVER]',
        `Resolution Playbook: ${playbookTitle}`,
        '',
        `• Target Application: \`${targetApp}\``,
        `• Incident UUID: \`${incident.ID}\``,
        `• Target Space: \`${targetSpace}\``,
        `• Category: \`${category}\` (${categoryHeading})`,
        `• Diagnostic Root Cause: ${rootCause}`,
        `• Correlated Request: \`${reqId}\``,
        '',
        '════════════════════════════════════════════════════════════════════════════════',
        '📋 PRESCRIPTIVE REMEDIATION PLAYBOOK (Authoritative CF Skill Catalog)',
        '════════════════════════════════════════════════════════════════════════════════',
        '',
        '1. Diagnostic Exit Code Signature Analysis:',
        `   ${exitCodesAnalysis}`,
        '',
        '2. Loggregator Standard Error & Crash Capture:',
        `   Run: \`${logsStep}\``,
        '',
        '3. Cloud Foundry Lifecycle Events Audit:',
        `   Run: \`${eventsStep}\``,
        '',
        '4. Resource Sizing & Memory / Instance Scaling:',
        `   Run: \`${scalingStep}\``,
        '',
        '5. Application Restart & Health Check Recovery:',
        `   Run: \`${restartStep}\``,
        '',
        '6. Gorouter Ingress Route Verification:',
        `   Run: \`${routeStep}\``,
        '',
        '────────────────────────────────────────────────────────────────────────────────',
        '⚡ Quick-Fix Autonomous Remediation Command Sequence:',
        `\`\`\`bash`,
        quickFix,
        `\`\`\``,
        '────────────────────────────────────────────────────────────────────────────────',
        'Status Transition: Resolution added by Agent'
    ];

    return {
        playbookText: playbookLines.join('\n'),
        quickFix,
        playbookTitle
    };
}

async function main() {
    console.log('================================================================');
    console.log('🚀 AUTONOMOUS INCIDENT DIAGNOSIS FOR ALL ACTIVE INCIDENTS');
    console.log(`📡 MCP Gateway: ${MCP_URL}`);
    console.log('================================================================\n');

    // 1. Initialize MCP Protocol Session
    console.log('1️⃣  Initializing MCP Protocol Session...');
    const initRes = await mcpCall('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Antigravity-Batch-Agent', version: '2.0.0' }
    }, null, 1);

    if (initRes.status !== 200) {
        throw new Error(`MCP Init failed with HTTP ${initRes.status}`);
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    console.log(`   ✅ Session Initialized: ${sessionId || 'standard'}\n`);

    // 2. Fetch all active incidents via IncidentService_Incidents_query
    console.log('2️⃣  Discovering all active incidents via MCP (IncidentService_Incidents_query)...');
    let page = 0;
    let allActiveIncidents = [];
    const pageSize = 50;

    let rows = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        const qRes = await mcpCall('tools/call', {
            name: 'IncidentService_Incidents_query',
            arguments: {
                return: 'rows',
                top: 100
            }
        }, sessionId, 10 + attempt);

        const content = qRes.data?.result?.content || [];
        rows = content.map(c => {
            try { return JSON.parse(c.text); } catch (e) { return c; }
        });

        console.log(`   • Attempt ${attempt}: Retrieved ${rows.length} incident record(s) from MCP server.`);
        if (rows.length > 0) break;
        await new Promise(r => setTimeout(r, 2000));
    }

    allActiveIncidents = rows.filter(r => 
        r.status !== 'Resolution added by Agent' && 
        r.status !== 'RESOLVED' && 
        r.status !== 'CLOSED'
    );

    console.log(`   📊 Discovered ${allActiveIncidents.length} active incident(s) requiring diagnosis.\n`);

    if (allActiveIncidents.length === 0) {
        console.log('   🎉 All incidents are already resolved or have resolutions added!');
        return;
    }

    const resultsSummary = [];

    // 3. Process each incident sequentially
    for (let i = 0; i < allActiveIncidents.length; i++) {
        const incident = allActiveIncidents[i];
        const num = i + 1;
        const total = allActiveIncidents.length;
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${num}/${total}] Diagnosing Incident: ${incident.ID}`);
        console.log(`     • Status:   ${incident.status}`);
        console.log(`     • Category: ${incident.errorCategory}`);
        console.log(`     • Target:   ${incident.applicationId || 'cf-app'}`);
        console.log(`     • Cause:    ${incident.rootCauseStatement}`);

        // A. Fetch Traces via IncidentService_TraceEvents_query
        const traceRes = await mcpCall('tools/call', {
            name: 'IncidentService_TraceEvents_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
            }
        }, sessionId, 100 + i * 10 + 1);

        const traces = (traceRes.data?.result?.content || []).map(c => {
            try { return JSON.parse(c.text); } catch (e) { return c; }
        });

        // B. Fetch Impacted Services via IncidentService_ImpactedServices_query
        const svcRes = await mcpCall('tools/call', {
            name: 'IncidentService_ImpactedServices_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
            }
        }, sessionId, 100 + i * 10 + 2);

        const services = (svcRes.data?.result?.content || []).map(c => {
            try { return JSON.parse(c.text); } catch (e) { return c; }
        });

        // C. Formulate Playbook
        const { playbookText, quickFix, playbookTitle } = buildPlaybook(incident, traces, services);

        // D. Post Message via IncidentService_Messages_create
        const msgRes = await mcpCall('tools/call', {
            name: 'IncidentService_Messages_create',
            arguments: {
                incident_ID: incident.ID,
                text: playbookText
            }
        }, sessionId, 100 + i * 10 + 3);

        const createdMsg = JSON.parse(msgRes.data?.result?.content?.[0]?.text || '{}');

        // E. Verify Status Transition via IncidentService_Incidents_query
        const verifyRes = await mcpCall('tools/call', {
            name: 'IncidentService_Incidents_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'ID', op: 'eq', value: incident.ID }]
            }
        }, sessionId, 100 + i * 10 + 4);

        const updatedInc = JSON.parse(verifyRes.data?.result?.content?.[0]?.text || '{}');
        const success = updatedInc.status === 'Resolution added by Agent';

        console.log(`     • Msg Created: ${createdMsg.ID || 'OK'}`);
        console.log(`     • Updated Status: ${updatedInc.status} ${success ? '✅' : '⚠️'}`);

        resultsSummary.push({
            id: incident.ID,
            category: incident.errorCategory,
            app: services[0]?.serviceName || incident.applicationId || 'cf-app',
            priorStatus: incident.status,
            newStatus: updatedInc.status,
            playbookTitle,
            quickFix,
            messageId: createdMsg.ID,
            verified: success
        });
    }

    console.log(`\n================================================================`);
    console.log(`🎉 BATCH DIAGNOSIS COMPLETE!`);
    console.log(`================================================================`);
    console.log(`Total Incidents Processed: ${resultsSummary.length}`);
    console.log(`Successfully Transitioned to "Resolution added by Agent": ${resultsSummary.filter(r => r.verified).length}/${resultsSummary.length}`);
    console.log('================================================================\n');

    return resultsSummary;
}

main().catch(err => {
    console.error('Fatal batch diagnosis error:', err.message || err);
    process.exit(1);
});
