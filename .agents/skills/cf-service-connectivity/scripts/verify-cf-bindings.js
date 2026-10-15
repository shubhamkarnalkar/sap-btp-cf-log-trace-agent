/**
 * Cloud Foundry Service Bindings & Connectivity Verification Script
 * 
 * Verifies that bound backing services (HANA Cloud, XSUAA, Destination, etc.)
 * are present in VCAP_SERVICES and reports binding anomalies.
 * 
 * Usage:
 *   node .agents/skills/cf-service-connectivity/scripts/verify-cf-bindings.js <app_name>
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
        console.error('Usage: node verify-cf-bindings.js <app_name>');
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(`🔗 Cloud Foundry Service Bindings Diagnostics`);
    console.log(`   Target Application: ${appName}`);
    console.log(`======================================================\n`);

    console.log('1️⃣  Querying application environment bindings (cf env)...');
    const envOutput = runCfCommand(`cf env ${appName}`);

    const hasHana = envOutput.toLowerCase().includes('hana') || envOutput.toLowerCase().includes('database');
    const hasXsuaa = envOutput.toLowerCase().includes('xsuaa') || envOutput.toLowerCase().includes('identity');
    const hasDest = envOutput.toLowerCase().includes('destination');
    const hasConn = envOutput.toLowerCase().includes('connectivity');

    console.log('\n2️⃣  Binding Health Audit:');
    console.log(`   - SAP HANA Cloud Database:  ${hasHana ? '✅ Bound' : '⚠️  Missing / Unbound'}`);
    console.log(`   - SAP Authorization (XSUAA): ${hasXsuaa ? '✅ Bound' : '⚠️  Missing / Unbound'}`);
    console.log(`   - SAP Destination Service:   ${hasDest ? '✅ Bound' : 'ℹ️  Not Bound'}`);
    console.log(`   - SAP Connectivity Service:  ${hasConn ? '✅ Bound' : 'ℹ️  Not Bound'}`);

    console.log('\n3️⃣  Recommendations:');
    if (!hasHana) {
        console.log(`   • To bind HANA Cloud: cf bind-service ${appName} <hana_instance_name> && cf restage ${appName}`);
    }
    if (!hasXsuaa) {
        console.log(`   • To bind XSUAA: cf bind-service ${appName} <xsuaa_instance_name> && cf restage ${appName}`);
    }
    if (hasHana && hasXsuaa) {
        console.log('   ✅ All essential enterprise backing services are bound to the application.');
    }
    console.log('');
}

main();
