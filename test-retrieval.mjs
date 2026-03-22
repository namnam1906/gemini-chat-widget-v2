import "dotenv/config";
import {
    retrieveRelevantDocuments,
    buildRetrievalContext
} from "./lib/retrieval.js";

async function main() {
    const query = "อัตราการจ่าย";

    const docs = await retrieveRelevantDocuments(query, {
        topK: 3,
        minScore: 1
    });

    console.log("Found relevant docs:", docs.length);

    for (const doc of docs) {
        console.log({
            name: doc.name,
            path: doc.path,
            score: doc.score
        });
    }

    console.log("\n=== CONTEXT ===\n");
    console.log(buildRetrievalContext(docs));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});