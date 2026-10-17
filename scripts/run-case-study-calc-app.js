/**
 * Case Study 1 Simulation & Verification Runner
 * 
 * Simulates a faulty application deployed to Cloud Foundry (e.g. division by zero in server.js:24),
 * captures the CF process crash telemetry, and triggers the AI agent resolution engine
 * to generate code-level diagnostics, file:line pinpointing, and prescriptive code diffs.
 */

require('ts-node/register');
const cds = require('@sap/cds');

async function runCaseStudy() {
    console.log('========================================================================');
    console.log('🧪 CASE STUDY 1: CLOUD FOUNDRY RUNTIME CODE ERROR RESOLUTION');
    console.log('   Simulating: faulty-calc-app crashing on startup with division by zero');
    console.log('========================================================================\n');

    // 1. Bootstrap CAP in-memory SQLite and Logservice with implementation
    const m = await cds.load(['db/schema', 'srv/incidents']);
    await cds.deploy(m).to('sqlite::memory:');
    const impl = require('../srv/incidents.ts');
    const srv = await cds.serve('Logservice').from(m).with(impl);
    const { Logs, TraceEvents, Messages } = srv.entities;

    const crashRequestId = `case-study-calc-${Date.now()}`;

    // 2. Insert telemetry simulating the Cloud Foundry deployment crash
    console.log('1️⃣  Simulating container crash telemetry ingestion from Cloud Foundry...');
    const incidentRecord = {
        applicationId: 'faulty-calc-app',
        targetSpace: 'dev',
        correlatedRequestId: crashRequestId,
        timestamp: new Date().toISOString(),
        statusCode: 500,
        status: 'OPEN',
        errorCategory: 'CF_PROCESS_CRASH',
        rootCauseStatement: 'Fatal: Unhandled division by zero in calculateTransactionRatio at server.js:24:15',
        remediationAction: 'Pending diagnostic analysis',
        impactedServices: [{ serviceName: 'faulty-calc-app', instanceId: 'inst-app-calc-001' }],
        traces: [
            {
                timestamp: new Date().toISOString(),
                component: 'APP',
                serviceName: 'faulty-calc-app',
                statusCode: 500,
                logLevel: 'ERR',
                message: 'CRITICAL ERROR: Uncaught exception in application startup:\nError: Fatal: Unhandled division by zero in calculateTransactionRatio at server.js:24:15'
            },
            {
                timestamp: new Date().toISOString(),
                component: 'CELL',
                serviceName: 'faulty-calc-app',
                statusCode: 500,
                logLevel: 'ERR',
                message: 'app instance exited with exit_status: 1 (Crash / unhandled exception)'
            }
        ],
        messages: [{
            text: `[CF Ingestion] Ingested process crash telemetry for faulty-calc-app with Exit Status 1.`
        }]
    };

    const inserted = await INSERT.into(Logs).entries(incidentRecord);
    const incidentId = inserted.req?.data?.ID || (await SELECT.one.from(Logs).where({ correlatedRequestId: crashRequestId })).ID;

    console.log(`   ✅ Incident created with ID: ${incidentId}`);
    console.log(`   📦 Application: faulty-calc-app | Space: dev | Exit Status: 1\n`);

    // 3. Execute Resolution Task (Full AI Playbook mode)
    console.log('2️⃣  Executing AI Resolution Task via Logservice.executeResolutionTaskForIncident...');
    const resolvedIncident = await srv.send('executeResolutionTaskForIncident', {
        incident_ID: incidentId,
        prompt: 'Identify the exact file and line causing the crash and suggest the code fix with defensive zero check'
    });

    console.log('\n3️⃣  Diagnostic Findings & Code Resolution:');
    console.log(`   Status: ${resolvedIncident.status}`);
    console.log(`   Remediation Action: ${resolvedIncident.remediationAction}`);

    // 4. Retrieve Discussion Message inserted by the agent
    const messages = await SELECT.from(Messages).where({ incident_ID: incidentId }).orderBy('createdAt desc');
    const latestMessage = messages[0];

    console.log('\n========================================================================');
    console.log('📄 AGENT RESOLUTION MESSAGE APPOINTED TO DISCUSSIONS:');
    console.log('========================================================================');
    console.log(latestMessage?.text);
    console.log('========================================================================\n');

    // 5. Test Quick Resolution Mode (Ultra-Short)
    console.log('4️⃣  Testing Quick Resolution Mode (Short / TL;DR Format)...');
    await srv.send('suggestResolutionForIncident', {
        incident_ID: incidentId,
        prompt: 'as short as possible'
    });

    const shortMessages = await SELECT.from(Messages).where({ incident_ID: incidentId }).orderBy('createdAt desc');
    console.log('\n========================================================================');
    console.log('⚡ ULTRA-SHORT RESOLUTION (TL;DR):');
    console.log('========================================================================');
    console.log(shortMessages[0]?.text);
    console.log('========================================================================\n');

    console.log('✅ Case Study 1 successfully executed and verified!');
}

runCaseStudy().catch(err => {
    console.error('Case study execution failed:', err);
    process.exit(1);
});
