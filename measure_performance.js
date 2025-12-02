const { detectIntent } = require('./server-with-azure-ai');
const fs = require('fs');

// Labeled Test Dataset
const testDataset = [
    // Greet
    { text: "Hello there", intent: "greet" },
    { text: "Hi", intent: "greet" },
    { text: "Good morning", intent: "greet" },

    // Hotel Info
    { text: "What time is check-in?", intent: "hotel_info" },
    { text: "check out time", intent: "hotel_info" },
    { text: "wifi password", intent: "hotel_info" },
    { text: "is there a pool?", intent: "hotel_info" }, // might fail if logic is simple

    // Dining
    { text: "breakfast hours", intent: "dining" },
    { text: "room service menu", intent: "dining" },
    { text: "where can I eat dinner", intent: "dining" },

    // Transport
    { text: "call me a taxi", intent: "transport" },
    { text: "shuttle to airport", intent: "transport" },
    { text: "how to get to downtown", intent: "transport" },

    // Local Attractions
    { text: "restaurants near me", intent: "local_attractions" },
    { text: "things to do nearby", intent: "local_attractions" },
    { text: "attractions in the city", intent: "local_attractions" },

    // Translation
    { text: "translate hello to spanish", intent: "translation" },
    { text: "how do you say thank you in french", intent: "translation" }, // might fail if logic is strict

    // Small Talk
    { text: "thank you", intent: "small_talk" },
    { text: "thanks a lot", intent: "small_talk" },
    { text: "goodbye", intent: "small_talk" }
];

function calculateMetrics() {
    console.log('📊 Calculating Performance Metrics...\n');

    const results = {
        total: 0,
        correct: 0,
        byIntent: {}
    };

    // Initialize intent stats
    const intents = [...new Set(testDataset.map(i => i.intent))];
    intents.forEach(intent => {
        results.byIntent[intent] = { tp: 0, fp: 0, fn: 0, count: 0 };
    });

    // Run predictions
    testDataset.forEach(sample => {
        const predicted = detectIntent(sample.text);
        results.total++;

        // Update count for ground truth intent
        if (results.byIntent[sample.intent]) {
            results.byIntent[sample.intent].count++;
        }

        if (predicted === sample.intent) {
            results.correct++;
            if (results.byIntent[predicted]) results.byIntent[predicted].tp++;
        } else {
            // False Negative for the correct intent
            if (results.byIntent[sample.intent]) results.byIntent[sample.intent].fn++;
            // False Positive for the predicted intent (if it's one we track)
            if (results.byIntent[predicted]) results.byIntent[predicted].fp++;
        }
    });

    // Calculate Precision, Recall, F1
    let report = "# 📈 Bot Performance Report\n\n";
    report += `**Overall Accuracy:** ${((results.correct / results.total) * 100).toFixed(2)}%\n\n`;
    report += "| Intent Category | Precision | Recall | F1 Score | Support |\n";
    report += "|---|---|---|---|---|\n";

    console.log(`Overall Accuracy: ${((results.correct / results.total) * 100).toFixed(2)}%`);
    console.log('--------------------------------------------------');
    console.log('Intent\t\tPrecision\tRecall\t\tF1 Score');
    console.log('--------------------------------------------------');

    intents.forEach(intent => {
        const stats = results.byIntent[intent];
        const precision = stats.tp / (stats.tp + stats.fp) || 0;
        const recall = stats.tp / (stats.tp + stats.fn) || 0;
        const f1 = 2 * ((precision * recall) / (precision + recall)) || 0;

        const pStr = (precision * 100).toFixed(1) + '%';
        const rStr = (recall * 100).toFixed(1) + '%';
        const f1Str = f1.toFixed(2);

        console.log(`${intent.padEnd(15)} ${pStr.padEnd(10)} ${rStr.padEnd(10)} ${f1Str}`);
        report += `| ${intent} | ${pStr} | ${rStr} | ${f1Str} | ${stats.count} |\n`;
    });

    fs.writeFileSync('PERFORMANCE_METRICS.md', report);
    console.log('\n📝 Detailed report saved to PERFORMANCE_METRICS.md');
}

calculateMetrics();
