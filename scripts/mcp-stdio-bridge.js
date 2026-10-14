/**
 * Model Context Protocol (MCP) Stdio-to-HTTP Gateway Bridge
 * 
 * Bridges Antigravity IDE's native Stdio MCP transport to the CAP
 * @gavdi/cap-mcp Streamable HTTP endpoint on http://localhost:4004/mcp.
 */

const readline = require('readline');

const MCP_URL = process.env.MCP_URL || 'http://localhost:4004/mcp';
const AUTH_HEADER = 'Basic ' + Buffer.from('alice:').toString('base64');

let sessionId = null;
let queue = Promise.resolve();

async function forwardMcp(payload) {
    const isNotification = payload?.id === undefined || payload?.id === null;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': AUTH_HEADER
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    try {
        const res = await fetch(MCP_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const newSessionId = res.headers.get('mcp-session-id');
        if (newSessionId) sessionId = newSessionId;

        const text = await res.text();
        if (!text || text.trim() === '') {
            // Notifications and 202/204 empty responses do not return output
            return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
            // Parse SSE data events
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr) process.stdout.write(dataStr + '\n');
                }
            }
        } else {
            // Standard JSON-RPC payload
            process.stdout.write(text.trim() + '\n');
        }
    } catch (err) {
        if (!isNotification) {
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: payload?.id,
                error: {
                    code: -32603,
                    message: 'Bridge forward error: ' + (err.message || String(err))
                }
            }) + '\n');
        }
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
});

rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
        const payload = JSON.parse(trimmed);
        queue = queue.then(() => forwardMcp(payload)).catch(err => {
            console.error('Bridge error:', err);
        });
    } catch (e) {
        // ignore malformed lines
    }
});
