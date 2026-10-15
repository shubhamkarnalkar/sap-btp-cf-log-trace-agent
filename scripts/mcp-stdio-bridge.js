/**
 * Model Context Protocol (MCP) Stdio-to-HTTP Gateway Bridge
 * 
 * Bridges Antigravity IDE's native Stdio MCP transport to the CAP
 * @gavdi/cap-mcp Streamable HTTP endpoint on http://localhost:4004/mcp.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'bridge_debug.log');
function logDebug(msg) {
    try {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (_) {}
}

logDebug('--- Bridge Process Started --- PID: ' + process.pid + ' ARGV: ' + JSON.stringify(process.argv));

const MCP_URL = process.argv[2] || process.env.MCP_URL || 'http://localhost:4004/mcp';
const AUTH_HEADER = process.env.MCP_AUTH_HEADER || ('Basic ' + Buffer.from('alice:').toString('base64'));

logDebug('Target MCP_URL: ' + MCP_URL);

let sessionId = null;
let queue = Promise.resolve();

async function forwardMcp(payload) {
    const isNotification = payload?.id === undefined || payload?.id === null;
    logDebug(`>> INCOMING [id=${payload?.id}] [method=${payload?.method}] isNotification=${isNotification}`);
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
        logDebug(`<< HTTP ${res.status} [sessionId=${sessionId}]`);

        const text = await res.text();
        if (!text || text.trim() === '') {
            logDebug('<< Empty response body');
            return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr) {
                        try {
                            JSON.parse(dataStr);
                            logDebug('<< OUT (SSE): ' + dataStr.slice(0, 200));
                            process.stdout.write(dataStr + '\n');
                        } catch {
                            // ignore non-json SSE frames
                        }
                    }
                }
            }
        } else {
            try {
                const parsed = JSON.parse(text);
                const outStr = JSON.stringify(parsed);
                logDebug('<< OUT (JSON): ' + outStr.slice(0, 200));
                process.stdout.write(outStr + '\n');
            } catch {
                if (!isNotification) {
                    const errPayload = {
                        jsonrpc: '2.0',
                        id: payload?.id,
                        error: {
                            code: -32603,
                            message: `Bridge received non-JSON HTTP ${res.status}: ${text.slice(0, 180)}`
                        }
                    };
                    logDebug('<< OUT (ERR NON-JSON): ' + JSON.stringify(errPayload));
                    process.stdout.write(JSON.stringify(errPayload) + '\n');
                }
            }
        }
    } catch (err) {
        logDebug('!! Fetch error: ' + (err.message || String(err)));
        if (!isNotification) {
            const errPayload = {
                jsonrpc: '2.0',
                id: payload?.id,
                error: {
                    code: -32603,
                    message: 'Bridge forward error: ' + (err.message || String(err))
                }
            };
            logDebug('<< OUT (FETCH ERR): ' + JSON.stringify(errPayload));
            process.stdout.write(JSON.stringify(errPayload) + '\n');
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
    logDebug('RAW STDIN LINE: ' + trimmed.slice(0, 300));
    try {
        const payload = JSON.parse(trimmed);
        queue = queue.then(() => forwardMcp(payload)).catch(err => {
            logDebug('Queue error: ' + (err.message || String(err)));
            console.error('Bridge error:', err);
        });
    } catch (e) {
        logDebug('MALFORMED STDIN: ' + trimmed);
    }
});

