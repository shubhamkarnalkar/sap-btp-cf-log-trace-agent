/**
 * Autonomous AI Agent Execution via Model Context Protocol (MCP)
 * 
 * Performs:
 * 1. Initialize MCP JSON-RPC 2.0 session on http://localhost:4004/mcp
 * 2. Discover next OPEN or INVESTIGATING incident via IncidentService_Incidents_query
 * 3. Fetch container traces via IncidentService_TraceEvents_query
 * 4. Fetch impacted services via IncidentService_ImpactedServices_query
 * 5. Formulate prescriptive resolution playbook (Human-in-the-Loop)
 * 6. Append resolution message to discussions via IncidentService_Messages_create
 *    (Without updating the incident status or remediationAction directly)
 */

const MCP_URL = process.env.MCP_URL || 'http://localhost:4004/mcp';
const AUTH_HEADER = 'Basic ' + Buffer.from('alice:').toString('base64');

async function mcpRequest(method, params, sessionId, id = 1) {
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

async function run() {
    console.log('================================================================');
    console.log('🤖 AI AGENT: Autonomous Incident Diagnosis via MCP Protocol');
    console.log(`📡 MCP Server Gateway: ${MCP_URL}`);
    console.log('================================================================\n');

    // Step 1: Initialize MCP Session
    console.log('1️⃣  Establishing MCP JSON-RPC Session...');
    const init = await mcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Antigravity-AI-Agent', version: '2.0.0' }
    });

    if (init.status !== 200) {
        throw new Error(`MCP Init failed with HTTP ${init.status}: ` + JSON.stringify(init.data));
    }

    const sessionId = init.headers.get('mcp-session-id');
    console.log(`   ✅ Session Initialized. Session-ID: ${sessionId || 'standard'}\n`);

    const targetIdArg = process.argv[2];

    // Step 2: Query Incident via MCP
    let incident = null;
    if (targetIdArg) {
        console.log(`2️⃣  Targeting specified Incident ID via MCP: ${targetIdArg}...`);
        const qRes = await mcpRequest('tools/call', {
            name: 'IncidentService_Incidents_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'ID', op: 'eq', value: targetIdArg }]
            }
        }, sessionId, 2);
        const rows = (qRes.data?.result?.content || []).map(c => {
            try { return JSON.parse(c.text); } catch(e) { return c; }
        });
        incident = rows[0];
    } else {
        console.log('2️⃣  Discovering next active incident via MCP (IncidentService_Incidents_query)...');
        let qRes = await mcpRequest('tools/call', {
            name: 'IncidentService_Incidents_query',
            arguments: {
                return: 'rows',
                where: [{ field: 'status', op: 'eq', value: 'OPEN' }],
                top: 5
            }
        }, sessionId, 2);
        let rows = (qRes.data?.result?.content || []).map(c => {
            try { return JSON.parse(c.text); } catch(e) { return c; }
        });
        
        // If no OPEN incidents, check INVESTIGATING
        if (rows.length === 0) {
            console.log('   ℹ️  No OPEN incidents found, checking INVESTIGATING state...');
            qRes = await mcpRequest('tools/call', {
                name: 'IncidentService_Incidents_query',
                arguments: {
                    return: 'rows',
                    where: [{ field: 'status', op: 'eq', value: 'INVESTIGATING' }],
                    top: 5
                }
            }, sessionId, 21);
            rows = (qRes.data?.result?.content || []).map(c => JSON.parse(c.text));
        }

        if (rows.length === 0) {
            console.log('   ℹ️  No active incidents found in database.');
            return;
        }

        incident = rows[0];
    }

    if (!incident) {
        console.log('   ❌ Incident could not be resolved.');
        return;
    }

    console.log(`   🎯 Selected Target Incident: ${incident.ID}`);
    console.log(`   • Status:        ${incident.status}`);
    console.log(`   • Category:      ${incident.errorCategory}`);
    console.log(`   • Target App:    ${incident.applicationId}`);
    console.log(`   • Target Space:  ${incident.targetSpace}`);
    console.log(`   • Root Cause:    ${incident.rootCauseStatement}\n`);

    // Step 3: Fetch Traces via MCP
    console.log('3️⃣  Retrieving telemetry traces via MCP (IncidentService_TraceEvents_query)...');
    const traceRes = await mcpRequest('tools/call', {
        name: 'IncidentService_TraceEvents_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 3);

    const traces = (traceRes.data?.result?.content || []).map(c => JSON.parse(c.text));
    console.log(`   ✅ Retrieved ${traces.length} trace event(s) from MCP server.`);
    traces.forEach((t, i) => {
        console.log(`      [${i+1}] Component: ${t.component || 'N/A'} | StatusCode: ${t.statusCode || '-'} | Level: ${t.logLevel} | ${t.message}`);
    });

    // Step 4: Fetch Impacted Services via MCP
    console.log('\n4️⃣  Retrieving impacted services via MCP (IncidentService_ImpactedServices_query)...');
    const svcRes = await mcpRequest('tools/call', {
        name: 'IncidentService_ImpactedServices_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 4);

    const services = (svcRes.data?.result?.content || []).map(c => JSON.parse(c.text));
    console.log(`   ✅ Retrieved ${services.length} impacted service(s).`);

    // Step 5: Synthesize Diagnostic Playbook (Human-in-the-Loop Safe)
    console.log('\n5️⃣  Synthesizing Prescriptive Diagnostic Playbook...');
    const appName = incident.applicationId || 'cf-app';
    const category = incident.errorCategory || 'CF_GENERAL';
    const rc = incident.rootCauseStatement || '';
    
    let playbookTitle = '';
    let diagnosis = '';
    let cliSteps = [];

    if (category.includes('CRASH') || rc.toLowerCase().includes('crash')) {
        playbookTitle = 'Cloud Foundry Container Process Crash Playbook';
        diagnosis = `The container process died unexpectedly or terminated with an unhandled runtime exception. Gorouter detected endpoint failure.`;
        cliSteps = [
            `cf logs ${appName} --recent`,
            `cf events ${appName}`,
            `cf scale ${appName} -m 1G`,
            `cf restart ${appName}`
        ];
    } else if (category.includes('ROUTE') || rc.toLowerCase().includes('route')) {
        playbookTitle = 'Gorouter Route Mutation & Reachability Playbook';
        diagnosis = `Route mapping for '${appName}' was mutated or unmapped. Ingress traffic may encounter HTTP 503 or 404 router errors.`;
        cliSteps = [
            `cf routes`,
            `cf map-route ${appName} <domain> --hostname <host>`,
            `cf test-route ${appName}`
        ];
    } else if (category.includes('RESTAGE') || rc.toLowerCase().includes('restage')) {
        playbookTitle = 'Application Staging & Droplet Verification Playbook';
        diagnosis = `Droplet build or restage lifecycle event detected. Verify droplet compilation and staging environment variables.`;
        cliSteps = [
            `cf logs ${appName} --recent`,
            `cf env ${appName}`,
            `cf app ${appName}`
        ];
    } else if (category.includes('STOP') || rc.toLowerCase().includes('stop')) {
        playbookTitle = 'Application Instance Recovery Playbook';
        diagnosis = `Container instance is currently in STOPPED state. Route listeners have been unregistered from Gorouter.`;
        cliSteps = [
            `cf start ${appName}`,
            `cf scale ${appName} -i 2`,
            `cf routes`
        ];
    } else if (category.includes('DELETED') || rc.toLowerCase().includes('delete')) {
        playbookTitle = 'Service Instance / Key Restoration Playbook';
        diagnosis = `A backing service instance or service key was deleted. Dependent applications may fail database or destination lookups.`;
        cliSteps = [
            `cf services`,
            `cf recreate-service <service_name> || cf create-service <service> <plan> <name>`,
            `cf restage ${appName}`
        ];
    } else {
        playbookTitle = 'Cloud Foundry Audit & Telemetry Investigation Playbook';
        diagnosis = `Audit event detected on target resource. Telemetry logged for compliance and operator audit review.`;
        cliSteps = [
            `cf events ${appName}`,
            `cf app ${appName}`,
            `cf logs ${appName} --recent`
        ];
    }

    const proposedComment = [
        `🤖 [AI AGENT DIAGNOSTIC RESOLUTION - VIA MCP SERVER]`,
        `Policy: Human-in-the-Loop Safe (Proposed as Discussion Comment)`,
        `Diagnosis: ${diagnosis}`,
        `Error Category: ${category}`,
        `Target Space: ${incident.targetSpace || 'default'}`,
        ``,
        `📋 Prescriptive Remediation Playbook:`,
        ...cliSteps.map((s, i) => `${i + 1}. Run: \`${s}\``),
        ``,
        `⚠️ SRE Operator Note: Please verify the above commands. Once verified, confirm the resolution in the incident header.`
    ].join('\n');

    console.log('----------------------------------------------------------------');
    console.log(proposedComment);
    console.log('----------------------------------------------------------------\n');

    // Step 6: Post Resolution Comment via MCP (IncidentService_Messages_create)
    console.log('6️⃣  Posting resolution message via MCP tool: IncidentService_Messages_create...');
    console.log('   (Ensuring incident status is NOT updated immediately as requested)\n');
    
    const postRes = await mcpRequest('tools/call', {
        name: 'IncidentService_Messages_create',
        arguments: {
            incident_ID: incident.ID,
            text: proposedComment
        }
    }, sessionId, 6);

    if (postRes.data?.isError) {
        console.error('   ❌ MCP Tool Execution Failed:', postRes.data?.result?.content?.[0]?.text);
        return;
    }

    const createdMsgText = postRes.data?.result?.content?.[0]?.text;
    let createdMsg = null;
    try { createdMsg = JSON.parse(createdMsgText); } catch(e) { createdMsg = createdMsgText; }

    console.log('   ✅ MCP Tool Succeeded!');
    console.log(`   • Message ID:  ${createdMsg?.ID || 'created'}`);
    console.log(`   • Incident ID: ${incident.ID}`);

    // Query updated incident via MCP to confirm status transition
    const verifyRes = await mcpRequest('tools/call', {
        name: 'IncidentService_Incidents_query',
        arguments: {
            return: 'rows',
            where: [{ field: 'ID', op: 'eq', value: incident.ID }]
        }
    }, sessionId, 7);
    const updatedInc = JSON.parse(verifyRes.data?.result?.content?.[0]?.text || '{}');
    console.log(`   • Updated Incident Status: ${updatedInc.status || 'Resolution added by Agent'}`);

    console.log('\n================================================================');
    console.log('🎉 Task Complete: Prescriptive Resolution Proposed via MCP');
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('Fatal MCP Task Error:', err.message || err);
    process.exit(1);
});
