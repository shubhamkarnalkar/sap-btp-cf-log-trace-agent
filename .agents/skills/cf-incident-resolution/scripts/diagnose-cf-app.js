/**
 * Cloud Foundry Application Incident Diagnostic Script
 * 
 * Inspects a Cloud Foundry application's current state, recent events, and error logs,
 * analyzes failure signatures against the cf-incident-resolution catalog, and outputs
 * prescriptive remediation steps.
 * 
 * Usage:
 *   node .agents/skills/cf-incident-resolution/scripts/diagnose-cf-app.js <app_name>
 */

const { execSync } = require('child_process');

function runCfCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
        return err.stdout ? `${err.stdout}\n${err.stderr || ''}` : (err.message || String(err));
    }
}

function main() {
    const appName = process.argv[2];
    if (!appName) {
        console.error('Usage: node diagnose-cf-app.js <app_name>');
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(`🔍 Cloud Foundry Diagnostic & Resolution Advisor`);
    console.log(`   Target Application: ${appName}`);
    console.log(`======================================================\n`);

    // 1. Inspect App State
    console.log('1️⃣  Checking application status...');
    const appStatus = runCfCommand(`cf app ${appName}`);
    console.log(appStatus.split('\n').slice(0, 10).join('\n'));

    // 2. Fetch Recent Audit Events
    console.log('\n2️⃣  Fetching recent application lifecycle events...');
    const eventsOutput = runCfCommand(`cf events ${appName}`);
    console.log(eventsOutput.split('\n').slice(0, 15).join('\n'));

    // 3. Capture Recent Logs
    console.log('\n3️⃣  Analyzing recent log telemetry...');
    const logsOutput = runCfCommand(`cf logs ${appName} --recent`);
    
    // 4. Evaluate Diagnostic Signatures
    console.log('\n4️⃣  Synthesizing Root Cause & Remediation Plan:');
    const combined = `${appStatus}\n${eventsOutput}\n${logsOutput}`.toLowerCase();

    let rootCause = 'Unspecified runtime behavior';
    let remediation = [];

    if (combined.includes('137') || combined.includes('out of memory')) {
        rootCause = 'Container Out Of Memory (Exit 137 / SIGKILL)';
        remediation = [
            `cf scale ${appName} -m 1G`,
            `cf set-env ${appName} NODE_OPTIONS "--max-old-space-size=768"`,
            `cf restage ${appName}`
        ];
    } else if (combined.includes('exit_status: 1') || combined.includes('exit_status: 255')) {
        rootCause = 'Process Crash / Uncaught Exception (Exit 1/255)';
        remediation = [
            `cf logs ${appName} --recent`,
            `cf env ${appName}`,
            `cf restart ${appName}`
        ];
    } else if (combined.includes('143')) {
        rootCause = 'Graceful Termination Drain Timeout (Exit 143)';
        remediation = [
            `cf set-env ${appName} CF_STOP_TIMEOUT 60`,
            `cf restage ${appName}`
        ];
    } else if (combined.includes('502') || combined.includes('bad gateway')) {
        rootCause = 'Gorouter Ingress HTTP 502 Bad Gateway';
        remediation = [
            `cf logs ${appName} --recent`,
            `cf restart ${appName}`
        ];
    } else if (combined.includes('503') || combined.includes('service unavailable')) {
        rootCause = 'Service Unavailable (HTTP 503 / 0 Instances Running)';
        remediation = [
            `cf start ${appName}`,
            `cf scale ${appName} -i 2`
        ];
    } else if (combined.includes('504') || combined.includes('gateway timeout')) {
        rootCause = 'Gorouter HTTP 504 Gateway Timeout';
        remediation = [
            `cf logs ${appName} --recent`,
            `Review database query execution times and external HTTP calls.`
        ];
    } else if (combined.includes('health check failed') || combined.includes('health check timed out')) {
        rootCause = 'Health Check Timeout / Flapping Startup';
        remediation = [
            `cf set-health-check ${appName} http --path /health --timeout 180`,
            `cf restart ${appName}`
        ];
    } else {
        rootCause = 'General Operational Status Check';
        remediation = [
            `cf logs ${appName} --recent`,
            `cf app ${appName}`
        ];
    }

    console.log(`\n📌 Root Cause Analysis: ${rootCause}`);
    console.log(`\n🛠️  Prescriptive Remediation Steps:`);
    remediation.forEach((step, idx) => {
        console.log(`   ${idx + 1}. ${step}`);
    });
    console.log(`\n⚡ Recommended Quick-Fix CLI:`);
    console.log(`   ${remediation.filter(s => s.startsWith('cf ')).join(' && ')}\n`);
}

main();
