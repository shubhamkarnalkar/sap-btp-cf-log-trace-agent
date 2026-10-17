/**
 * Cloud Foundry Incident Resolution Task Runner
 * 
 * Executes autonomous Cloud Foundry error and warning diagnosis using the
 * cf-log-trace-agent skill catalog. Formulates prescriptive remediation
 * playbooks, updates the incident's remediationAction, and appends the
 * full diagnostic playbook into the messages/discussions composition.
 *
 * Usage:
 *   node scripts/execute-cf-resolution.js [incident_ID] [optional_prompt]
 */

const http = require('http');

async function postJson(url, data, headers = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': 'Basic ' + Buffer.from('alice:').toString('base64'),
            ...headers
        },
        body: JSON.stringify(data)
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = text; }
    return { status: res.status, headers: res.headers, data: json };
}

async function main() {
    const mcpUrl = process.env.MCP_URL || 'http://localhost:4004/mcp';
    const targetIncidentId = process.argv[2] || null;
    const customPrompt = process.argv[3] || 'Diagnose Cloud Foundry container failure, analyze telemetry traces, and recommend prescriptive remediation steps.';

    console.log(`\n======================================================`);
    console.log(`🚀 Executing Cloud Foundry Resolution Task via MCP`);
    console.log(`   Endpoint: ${mcpUrl}`);
    console.log(`======================================================\n`);

    // 1. Initialize MCP Protocol Session
    console.log('1️⃣  Initializing Model Context Protocol session...');
    const initRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'CF-Resolution-Task-Runner', version: '1.0.0' }
        }
    });

    if (initRes.status !== 200) {
        throw new Error(`Failed to initialize MCP session: HTTP ${initRes.status}`);
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    const mcpHeaders = sessionId ? { 'mcp-session-id': sessionId } : {};
    console.log(`   ✅ Session Established: ${sessionId || 'standard'}`);

    // Send initialized notification
    await postJson(mcpUrl, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    }, mcpHeaders);

    // 2. Discover Incident to Remediate
    let incident = null;
    if (targetIncidentId) {
        console.log(`\n2️⃣  Targeting specified Incident UUID: ${targetIncidentId}`);
        incident = { ID: targetIncidentId };
    } else {
        console.log('\n2️⃣  Querying for active Logs requiring remediation...');
        const queryRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'Logservice_Logs_query',
                arguments: { top: 1 }
            }
        }, mcpHeaders);

        try {
            const content = queryRes.data?.result?.content;
            if (Array.isArray(content) && content[0]?.text) {
                const parsed = JSON.parse(content[0].text);
                incident = Array.isArray(parsed) ? parsed[0] : parsed;
            }
        } catch (e) { }

        if (!incident || !incident.ID) {
            console.log('   ℹ️  No open Logs found in memory. Creating a sample Cloud Foundry incident for demonstration...');
            const createRes = await postJson(mcpUrl, {
                jsonrpc: '2.0',
                id: 21,
                method: 'tools/call',
                params: {
                    name: 'Logservice_Logs_create',
                    arguments: {
                        applicationId: 'order-processing-srv',
                        targetSpace: 'prod',
                        correlatedRequestId: 'req-cf-oom-4921',
                        statusCode: 503,
                        status: 'OPEN',
                        errorCategory: 'CF_APP_CRASH',
                        rootCauseStatement: 'Container killed by Diego Cell cgroup manager: Out Of Memory (Exit Status 137).',
                        remediationAction: 'Pending diagnostic resolution.'
                    }
                }
            }, mcpHeaders);

            const createdText = createRes.data?.result?.content?.[0]?.text;
            incident = JSON.parse(createdText);
            console.log(`   ✅ Created Diagnostic Incident: ${incident.ID}`);
        }
    }

    console.log(`   Incident ID: ${incident.ID}`);
    if (incident.statusCode) console.log(`   Status Code: ${incident.statusCode}`);
    if (incident.applicationId) console.log(`   Application: ${incident.applicationId}`);
    if (incident.errorCategory) console.log(`   Category:    ${incident.errorCategory}`);
    if (incident.rootCauseStatement) console.log(`   Root Cause:  ${incident.rootCauseStatement}`);

    // 3. Execute Resolution Task via MCP Tool
    console.log(`\n3️⃣  Executing Resolution Task Tool ('executeResolutionTask')...`);
    console.log(`   Prompt: "${customPrompt}"`);

    const taskRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'executeResolutionTask',
            arguments: {
                ID: incident.ID,
                prompt: customPrompt
            }
        }
    }, mcpHeaders);

    if (taskRes.data?.isError) {
        console.error('   ❌ Task Execution Failed:', taskRes.data?.result?.content?.[0]?.text);
        return;
    }

    let updatedIncident = null;
    try {
        const text = taskRes.data?.result?.content?.[0]?.text;
        updatedIncident = JSON.parse(text);
    } catch (e) {
        console.log('   Raw Result:', taskRes.data);
    }

    console.log(`\n4️⃣  Resolution Task Completed Successfully!`);
    if (updatedIncident) {
        console.log(`   • Updated Status:       ${updatedIncident.status}`);
        console.log(`   • Remediation Command:  ${updatedIncident.remediationAction}`);
    }

    // 4. Query Discussion Messages to Display the Added Resolution via MCP
    console.log(`\n5️⃣  Verifying Added Resolution Message in Discussions...`);
    try {
        const msgRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: {
                name: 'Logservice_Messages_query',
                arguments: {
                    return: 'rows',
                    where: [{ field: 'incident_ID', op: 'eq', value: incident.ID }]
                }
            }
        }, mcpHeaders);
        let rows = [];
        const rawText = msgRes.data?.result?.content?.[0]?.text;
        if (rawText) {
            try {
                const parsed = JSON.parse(rawText);
                rows = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                rows = [{ text: rawText }];
            }
        }
        console.log(`   ✅ Total Messages in Composition: ${rows.length}`);
        if (rows.length > 0) {
            const latest = rows[rows.length - 1];
            console.log(`\n📜 [LATEST RESOLUTION MESSAGE ADDED]:`);
            console.log(`------------------------------------------------------`);
            console.log(latest.text || latest);
            console.log(`------------------------------------------------------`);
        }
    } catch (e) {
        console.log('   Could not retrieve message details:', e.message);
    }

    console.log(`\n======================================================`);
    console.log(`🎉 Cloud Foundry Incident Resolution Task Finished!`);
    console.log(`======================================================\n`);
}

main().catch(err => {
    console.error('Fatal Task Error:', err.message || err);
    process.exit(1);
});
