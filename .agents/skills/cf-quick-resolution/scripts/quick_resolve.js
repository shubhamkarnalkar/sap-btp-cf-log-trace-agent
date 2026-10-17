/**
 * Skill Script: quick_resolve.js
 * 
 * Executable task for Antigravity AI Agent to suggest incident resolution
 * in as short a format as possible (3-line TL;DR) and append it to discussions.
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

async function runQuickResolve(incidentId) {
    const mcpUrl = process.env.MCP_URL || 'http://127.0.0.1:4004/mcp';

    console.log(`[cf-quick-resolution skill] Suggesting quick resolution on ${mcpUrl}...`);

    // 1. Initialize MCP session
    const initRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'cf-quick-resolution-task', version: '1.0.0' }
        }
    });

    const sessionId = initRes.headers.get('mcp-session-id');
    const headers = sessionId ? { 'mcp-session-id': sessionId } : {};

    await postJson(mcpUrl, { jsonrpc: '2.0', method: 'notifications/initialized' }, headers);

    // 2. Discover incident
    let targetIncident = null;
    if (incidentId) {
        const queryRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'Logservice_Logs_get',
                arguments: { ID: incidentId }
            }
        }, headers);
        try {
            targetIncident = JSON.parse(queryRes.data?.result?.content?.[0]?.text);
        } catch (e) { }
    } else {
        const queryRes = await postJson(mcpUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'Logservice_Logs_query',
                arguments: { top: 1 }
            }
        }, headers);
        try {
            const parsed = JSON.parse(queryRes.data?.result?.content?.[0]?.text);
            targetIncident = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch (e) { }
    }

    if (!targetIncident || !targetIncident.ID) {
        console.error('[cf-quick-resolution skill] No incident found to resolve.');
        return;
    }

    const targetId = targetIncident.ID;
    const targetApp = targetIncident.applicationId || 'cf-app';

    // 3. Invoke suggestResolution with prompt 'as short as possible'
    console.log(`[cf-quick-resolution skill] Calling suggestResolution for incident ${targetId}...`);
    const actionRes = await postJson(mcpUrl, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'Logservice_suggestResolution',
            arguments: {
                incident_ID: targetId,
                prompt: 'as short as possible'
            }
        }
    }, headers);

    console.log('[cf-quick-resolution skill] Resolution action completed.');
    console.log(actionRes.data?.result?.content?.[0]?.text || actionRes.data);
}

const incidentArg = process.argv[2];
runQuickResolve(incidentArg).catch(err => {
    console.error('[cf-quick-resolution skill] Execution failed:', err.message || err);
    process.exit(1);
});
