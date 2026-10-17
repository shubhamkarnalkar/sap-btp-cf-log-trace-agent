const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

/**
 * Calculates average transaction metric.
 * 
 * BUG (Case Study 1):
 * When divisor is 0, this throws an unhandled exception or returns Infinity/NaN,
 * which when unchecked during startup calculation causes the Node.js process to exit with code 1.
 */
function calculateTransactionRatio(totalSum, transactionCount) {
    // Missing defensive check: if (transactionCount === 0) return 0;
    if (transactionCount === 0) {
        throw new Error("Fatal: Unhandled division by zero in calculateTransactionRatio at server.js:24:15");
    }
    return totalSum / transactionCount;
}

// Simulated initialization routine that runs at container startup on Cloud Foundry
function initializeAppMetrics() {
    console.log('[STARTUP] Initializing metrics engine and database warm-up...');
    const sampleSum = 5000;
    const initialBatchCount = 0; // Trigger for division by zero

    // Line 24: Unhandled call causing crash on deploy
    const initialRatio = calculateTransactionRatio(sampleSum, initialBatchCount);
    console.log(`[STARTUP] Initial ratio computed: ${initialRatio}`);
}

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

app.get('/calculate', (req, res) => {
    const sum = Number(req.query.sum || 100);
    const count = Number(req.query.count || 0);
    try {
        const result = calculateTransactionRatio(sum, count);
        res.json({ sum, count, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trigger startup execution (simulates crash when deployed to Cloud Foundry)
try {
    initializeAppMetrics();
    app.listen(port, () => {
        console.log(`Faulty app listening on port ${port}`);
    });
} catch (fatalError) {
    console.error('CRITICAL ERROR: Uncaught exception in application startup:');
    console.error(fatalError.stack || fatalError.message);
    // Cloud Foundry Diego cell detects Exit Status 1
    process.exit(1);
}
