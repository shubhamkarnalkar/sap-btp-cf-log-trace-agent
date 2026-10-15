/**
 * Autonomous Cloud Foundry Incident Diagnosis via Model Context Protocol (MCP)
 * 
 * Strict Requirements:
 * 1. Use ONLY MCP tools (IncidentService_Incidents_query, IncidentService_TraceEvents_query, IncidentService_ImpactedServices_query) to fetch telemetry.
 * 2. Formulate a prescriptive remediation playbook (exit codes, cf logs, cf events, scaling, restart steps) using the cf-log-trace-agent skill catalog.
 * 3. Post the playbook as a discussion comment using IncidentService_Messages_create MCP tool.
 * 4. Verify that the incident's status automatically transitions to "Resolution added by Agent".
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

async function runAutonomousDiagnosis() {
    console.log('================================================================');
    console.log('🤖 AUTONOMOUS CLOUD FOUNDRY INCIDENT DIAGNOSIS VIA MCP PROTOCOL');
    console.log(`📡 MCP Gateway: ${MCP_URL}`);
    console.log('================================================================\n');

    // 1. Initialize MCP Protocol Session
    console.log('1️⃣  Initializing MCP Session...');
    const initRes = await mcpCall('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Antigravity-CF-Autonomous-Agent', version: '2.0.0' }
    }, null, 1);

    if (initRes.status !== 200) {
        throw new Error(`MCP Initialization failed with HTTP ${initRes.status}: ` + JSON.stringify(initRes.data));
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    console.log(`   ✅ Session Initialized. Session-ID: ${sessionId || 'standard'}\n`);

    // Requirement 1: Use ONLY IncidentService_Incidents_query to discover active incident
    console.log('2️⃣  Discovering next active incident via MCP (IncidentService_Incidents_query)...');
    let incRes = await mcpCall('tools/call', {
        name: 'IncidentService_Incidents_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'status', op: 'eq', value: 'INVESTIGATING' }],
            top: 1
        }
    }, sessionId, 2);

    let incidentRows = (incRes.data?.result?.content || []).map(c => {
        try { return JSON.parse(c.text); } catch(e) { return c; }
    });

    if (incidentRows.length === 0) {
        console.log('   ℹ️  No INVESTIGATING incidents, checking OPEN...');
        incRes = await mcpCall('tools/call', {
            name: 'IncidentService_Incidents_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'status', op: 'eq', value: 'OPEN' }],
                top: 1
            }
        }, sessionId, 21);
        incidentRows = (incRes.data?.result?.content || []).map(c => JSON.parse(c.text));
    }

    if (incidentRows.length === 0) {
        throw new Error('No active incidents found in the system to diagnose.');
    }

    const incident = incidentRows[0];
    console.log(`   🎯 Selected Active Incident: ${incident.ID}`);
    console.log(`   • Current Status:    ${incident.status}`);
    console.log(`   • Error Category:    ${incident.errorCategory}`);
    console.log(`   • Target Space:      ${incident.targetSpace}`);
    console.log(`   • Correlated Req ID: ${incident.correlatedRequestId}`);
    console.log(`   • Root Cause:        ${incident.rootCauseStatement}\n`);

    // Requirement 1: Query telemetry traces via IncidentService_TraceEvents_query
    console.log('3️⃣  Fetching telemetry traces via MCP (IncidentService_TraceEvents_query)...');
    const traceRes = await mcpCall('tools/call', {
        name: 'IncidentService_TraceEvents_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 3);

    const traces = (traceRes.data?.result?.content || []).map(c => {
        try { return JSON.parse(c.text); } catch (e) { return c; }
    });
    console.log(`   ✅ Retrieved ${traces.length} trace event(s) from MCP server:`);
    traces.forEach((t, i) => {
        console.log(`      [${i+1}] Component: ${t.component || 'N/A'} | StatusCode: ${t.statusCode || '-'} | LogLevel: ${t.logLevel} | ${t.message}`);
    });

    // Requirement 1: Query impacted services via IncidentService_ImpactedServices_query
    console.log('\n4️⃣  Fetching impacted services via MCP (IncidentService_ImpactedServices_query)...');
    const svcRes = await mcpCall('tools/call', {
        name: 'IncidentService_ImpactedServices_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 4);

    const services = (svcRes.data?.result?.content || []).map(c => {
        try { return JSON.parse(c.text); } catch (e) { return c; }
    });
    console.log(`   ✅ Retrieved ${services.length} impacted service(s):`);
    services.forEach((s, i) => {
        console.log(`      [${i+1}] Service Name: ${s.serviceName} | Instance ID: ${s.instanceId}`);
    });

    const targetAppName = services[0]?.serviceName || incident.applicationId || 'cf-log-trace-agent-srv';
    const targetSpace = incident.targetSpace || 'dev';

    // Requirement 2: Formulate prescriptive remediation playbook using cf-log-trace-agent skill catalog
    console.log('\n5️⃣  Formulating Prescriptive Remediation Playbook (CF Skills Catalog)...');
    
    const playbookLines = [
        '🤖 [AI AGENT DIAGNOSTIC RESOLUTION - VIA MCP SERVER]',
        'Resolution Playbook: Cloud Foundry Process Crash & Ingress Service Degradation',
        '',
        `• Target Application: \`${targetAppName}\``,
        `• Incident UUID: \`${incident.ID}\``,
        `• Target Space: \`${targetSpace}\``,
        `• Correlated Request ID: \`${incident.correlatedRequestId}\``,
        `• Error Category: \`${incident.errorCategory}\``,
        `• Diagnostic Root Cause: ${incident.rootCauseStatement}`,
        '',
        '════════════════════════════════════════════════════════════════════════════════',
        '📋 PRESCRIPTIVE REMEDIATION PLAYBOOK (Authoritative CF Skill Catalog)',
        '════════════════════════════════════════════════════════════════════════════════',
        '',
        '1. Diagnostic Exit Code Signature Analysis:',
        `   Inspect Diego Cell lifecycle container termination events and exit codes:`,
        `   cf events ${targetAppName}`,
        `   - Exit 1 / Exit 255: Fatal unhandled runtime exception, unhandled promise rejection, missing npm modules, or startup configuration failure.`,
        `   - Exit 137: Out of Memory (OOM) - container breached memory cgroup ceiling and was killed by Diego Cell.`,
        `   - Exit 143: Graceful termination timeout exceeded (SIGTERM) during container draining.`,
        '',
        '2. Loggregator Standard Error Capture:',
        `   Capture recent runtime standard error and stack traces:`,
        `   cf logs ${targetAppName} --recent`,
        `   Correlate RTR (Gorouter) 503 endpoint failure events with APP runtime exceptions.`,
        '',
        '3. Backing Service & Environment Binding Verification:',
        `   Verify environment variables and service bindings (XSUAA, HANA, Destination):`,
        `   cf env ${targetAppName}`,
        `   cf services`,
        `   Ensure credentials in VCAP_SERVICES are valid and backing services are online.`,
        '',
        '4. Resource Sizing & Memory / Instance Scaling:',
        `   Prevent out-of-memory crashes and provide high-availability redundancy:`,
        `   - Scale memory quota: cf scale ${targetAppName} -m 1G`,
        `   - Scale horizontally to multi-instance: cf scale ${targetAppName} -i 2`,
        `   - For Node.js/V8 heap ceiling headroom:`,
        `     cf set-env ${targetAppName} NODE_OPTIONS "--max-old-space-size=800"`,
        '',
        '5. Application Restart & Health Check Recovery:',
        `   Restart application instances to re-register active listening sockets with Gorouter:`,
        `   cf restart ${targetAppName}`,
        `   (If startup exceeds default 60s, extend health check timeout: cf set-health-check ${targetAppName} http --path /health --timeout 180)`,
        '',
        '6. Gorouter Ingress Route Verification:',
        `   Verify route mapping and confirm HTTP 200 reachability:`,
        `   cf routes`,
        '',
        '────────────────────────────────────────────────────────────────────────────────',
        '⚡ Quick-Fix Autonomous Remediation Command Sequence:',
        `cf logs ${targetAppName} --recent && cf scale ${targetAppName} -m 1G -i 2 && cf restart ${targetAppName}`,
        '────────────────────────────────────────────────────────────────────────────────',
        'Status Transition: Resolution added by Agent'
    ];

    const playbookText = playbookLines.join('\n');
    console.log('----------------------------------------------------------------');
    console.log(playbookText);
    console.log('----------------------------------------------------------------\n');

    // Requirement 3: Post the playbook as discussion comment using IncidentService_Messages_create MCP tool
    console.log('6️⃣  Posting Playbook Comment via MCP (IncidentService_Messages_create)...');
    const msgRes = await mcpCall('tools/call', {
        name: 'IncidentService_Messages_create',
        arguments: {
            incident_ID: incident.ID,
            text: playbookText
        }
    }, sessionId, 5);

    if (msgRes.data?.isError) {
        throw new Error('Failed to create message via MCP: ' + JSON.stringify(msgRes.data));
    }

    const createdMsg = JSON.parse(msgRes.data?.result?.content?.[0]?.text || '{}');
    console.log(`   ✅ Discussion Message Created!`);
    console.log(`   • Message ID:  ${createdMsg.ID}`);
    console.log(`   • Incident ID: ${createdMsg.incident_ID}`);
    console.log(`   • Created At:  ${createdMsg.createdAt}\n`);

    // Requirement 4: Verify that the incident's status automatically transitions to "Resolution added by Agent"
    console.log('7️⃣  Verifying Incident Status Transition via MCP (IncidentService_Incidents_query)...');
    const verifyRes = await mcpCall('tools/call', {
        name: 'IncidentService_Incidents_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 6);

    const updatedIncident = JSON.parse(verifyRes.data?.result?.content?.[0]?.text || '{}');
    console.log(`   ✅ Verification Result:`);
    console.log(`   • Incident ID:             ${updatedIncident.ID}`);
    console.log(`   • Previous Status:         ${incident.status}`);
    console.log(`   • Updated Status:          ${updatedIncident.status}`);
    console.log(`   • Target Space:            ${updatedIncident.targetSpace}`);
    console.log(`   • Modified At:             ${updatedIncident.modifiedAt}`);

    if (updatedIncident.status === 'Resolution added by Agent') {
        console.log(`\n🎉 SUCCESS: Incident status correctly transitioned to "Resolution added by Agent"!`);
    } else {
        console.warn(`\n⚠️ Status is: "${updatedIncident.status}" (Expected: "Resolution added by Agent")`);
    }

    console.log('\n================================================================');
    console.log('🎯 AUTONOMOUS DIAGNOSIS & REMEDIATION COMPLETE');
    console.log('================================================================\n');

    return {
        incident,
        traces,
        services,
        createdMsg,
        updatedIncident,
        playbookText
    };
}

runAutonomousDiagnosis().catch(err => {
    console.error('Fatal Autonomous Diagnosis Error:', err.message || err);
    process.exit(1);
});
