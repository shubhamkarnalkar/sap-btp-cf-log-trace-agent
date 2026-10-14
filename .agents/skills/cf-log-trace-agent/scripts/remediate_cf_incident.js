/**
 * Skill Script: remediate_cf_incident.js
 * 
 * Executable task for Antigravity AI Agent when prompted to resolve, remediate,
 * or add resolution messages for Cloud Foundry errors and warnings.
 *
 * Implements the standard 5-step autonomous protocol from the cf-log-trace-agent skill:
 * 1. Discover active/unresolved incidents
 * 2. Diagnose telemetry & exit codes (OOM, Gorouter, Process crashes, Warnings)
 * 3. Match against Cloud Foundry Error Resolution Catalog
 * 4. Execute executeResolutionTask / executeResolutionTaskForIncident
 * 5. Verify the added resolution message in the messages composition
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

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

async function runTask(incidentId, prompt) {
    const mcpUrl = process.env.MCP_URL || 'http://127.0.0.1:4004/mcp';
    const operatorPrompt = prompt || 'Analyze Cloud Foundry runtime telemetry, diagnose errors and warnings, and append prescriptive resolution playbook to messages.';

    console.log(`[cf-log-trace-agent skill] Executing resolution task on ${mcpUrl}...`);

    // 1. Initialize MCP session
    const initRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'cf-log-trace-agent-skill-task', version: '1.0.0' }
        }
    });

    const sessionId = initRes.headers.get('mcp-session-id');
    const headers = sessionId ? { 'mcp-session-id': sessionId } : {};

    await postJson(mcpUrl, { jsonrpc: '2.0', method: 'notifications/initialized' }, headers);

    // 2. Resolve target incident
    let targetId = incidentId;
    if (!targetId) {
        const queryRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'IncidentService_Incidents_query',
                arguments: { top: 1 }
            }
        }, headers);

        try {
            const parsed = JSON.parse(queryRes.data?.result?.content?.[0]?.text);
            targetId = (Array.isArray(parsed) ? parsed[0] : parsed)?.ID;
        } catch (e) {}
    }

    if (!targetId) {
        console.log('[cf-log-trace-agent skill] Creating demonstration incident...');
        const createRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 21,
            method: 'tools/call',
            params: {
                name: 'IncidentService_Incidents_create',
                arguments: {
                    applicationId: 'cf-core-api',
                    targetSpace: 'dev',
                    correlatedRequestId: 'corr-cf-diag-101',
                    status: 'OPEN',
                    errorCategory: 'CF_APP_CRASH',
                    rootCauseStatement: 'Container killed by Diego Cell cgroup manager: Out Of Memory (Exit Status 137).',
                    remediationAction: 'Pending remediation action.'
                }
            }
        }, headers);
        const created = JSON.parse(createRes.data?.result?.content?.[0]?.text);
        targetId = created.ID;
    }

    console.log(`[cf-log-trace-agent skill] Remediating Incident: ${targetId}`);

    // 3. Execute resolution task tool
    const callRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'executeResolutionTask',
            arguments: {
                ID: targetId,
                prompt: operatorPrompt
            }
        }
    }, headers);

    const result = JSON.parse(callRes.data?.result?.content?.[0]?.text);
    console.log(`[cf-log-trace-agent skill] Resolution Task Finished:`);
    console.log(`   - Status: ${result.status}`);
    console.log(`   - Remediation: ${result.remediationAction}`);

    return result;
}

if (require.main === module) {
    const targetId = process.argv[2];
    const prompt = process.argv[3];
    runTask(targetId, prompt).catch(err => {
        console.error('Task error:', err);
        process.exit(1);
    });
}

module.exports = { runTask };
