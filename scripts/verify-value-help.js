const AUTH = 'Basic ' + Buffer.from('alice:').toString('base64');

async function test() {
    console.log('--- 1. Querying Statuses OData Endpoint ---');
    const res = await fetch('http://localhost:4004/odata/v4/incident/Statuses', {
        headers: { 'Authorization': AUTH }
    });
    console.log('Statuses HTTP Status:', res.status);
    const data = await res.json();
    console.log('Statuses Data:', JSON.stringify(data, null, 2));

    console.log('\n--- 2. Checking $metadata for ValueList Annotations ---');
    const metaRes = await fetch('http://localhost:4004/odata/v4/incident/$metadata', {
        headers: { 'Authorization': AUTH }
    });
    const metaText = await metaRes.text();
    const hasValueList = metaText.includes('Common.ValueList') && metaText.includes('Statuses');
    console.log('ValueList found in metadata:', hasValueList);
    if (hasValueList) {
        const matches = metaText.split('\n').filter(l => 
            l.includes('ValueList') || l.includes('CollectionPath') || l.includes('ValueListWithFixedValues') || l.includes('IncidentService.Incidents/status')
        );
        console.log('Annotation snippets:\n', matches.map(l => l.trim()).join('\n'));
    }

    console.log('\n--- 3. Querying Statuses via MCP Tools ---');
    const mcpRes = await fetch('http://localhost:4004/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': AUTH
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'test-agent', version: '1.0' }
            }
        })
    });
    const sid = mcpRes.headers.get('mcp-session-id');
    const toolsRes = await fetch('http://localhost:4004/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': AUTH,
            ...(sid ? { 'mcp-session-id': sid } : {})
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'IncidentService_Statuses_query',
                arguments: { return: 'rows' }
            }
        })
    });
    const toolsData = await toolsRes.json();
    console.log('MCP IncidentService_Statuses_query Result:');
    const statusRows = (toolsData.result?.content || []).map(c => JSON.parse(c.text));
    console.log(JSON.stringify(statusRows, null, 2));
}

test().catch(console.error);
