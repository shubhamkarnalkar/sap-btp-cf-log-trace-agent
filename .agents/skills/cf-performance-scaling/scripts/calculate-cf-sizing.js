/**
 * Cloud Foundry Container Sizing & Heap Limit Calculator
 * 
 * Computes optimal memory allocations, language runtime heap boundaries (Node.js/JVM),
 * and generates recommended CF CLI commands based on memory input.
 * 
 * Usage:
 *   node .agents/skills/cf-performance-scaling/scripts/calculate-cf-sizing.js [target_memory_mb] [app_name]
 */

function main() {
    const memoryMb = parseInt(process.argv[2], 10) || 1024;
    const appName = process.argv[3] || 'my-cf-app';

    const nodeHeapMb = Math.floor(memoryMb * 0.75);
    const nativeReserveMb = memoryMb - nodeHeapMb;
    const diskQuotaMb = Math.max(memoryMb * 2, 1024);

    console.log(`\n======================================================`);
    console.log(`📐 Cloud Foundry Container Sizing Calculator`);
    console.log(`   Target Memory: ${memoryMb} MB | Application: ${appName}`);
    console.log(`======================================================\n`);

    console.log('1️⃣  Calculated Resource Allocation:');
    console.log(`   - Container Quota (Total RSS):   ${memoryMb} MB`);
    console.log(`   - Language Runtime Heap (75%):   ${nodeHeapMb} MB`);
    console.log(`   - Native / OS / C++ Reserve (25%): ${nativeReserveMb} MB`);
    console.log(`   - Recommended Disk Quota:         ${diskQuotaMb} MB\n`);

    console.log('2️⃣  Recommended Configuration Commands:\n');
    console.log('   # Scale container memory and disk quota:');
    console.log(`   cf scale ${appName} -m ${memoryMb}M -k ${diskQuotaMb}M\n`);

    console.log('   # For Node.js Applications (set V8 max heap):');
    console.log(`   cf set-env ${appName} NODE_OPTIONS "--max-old-space-size=${nodeHeapMb}"\n`);

    console.log('   # For Java / Spring Boot Applications (set JVM percentage):');
    console.log(`   cf set-env ${appName} JAVA_OPTS "-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"\n`);

    console.log('   # Apply changes by restaging:');
    console.log(`   cf restage ${appName}\n`);
}

main();
