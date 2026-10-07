import { connectToDatabricks } from "../databricks.js";
import { createTools, runTool } from "../agents/tools.js";

console.log("Connecting to Databricks...");
const databricks = await connectToDatabricks();
const tools = createTools(databricks);

// On joue le rôle du modèle : on demande chaque outil pour Apex AI 1367
console.log("\n1. Profile:");
console.log(await runTool(tools, "get_customer_profile", '{"customer_id":"C1367"}'));

console.log("\n2. Usage history (6 months):");
console.log(await runTool(tools, "get_usage_history", '{"customer_id":"C1367","months":6}'));

console.log("\n3. Support tickets (90 days):");
console.log(await runTool(tools, "get_support_tickets", '{"customer_id":"C1367","days":90}'));

console.log("\n4. Feedback (3 most recent):");
console.log(await runTool(tools, "get_feedback", '{"customer_id":"C1367","limit":3}'));

// Le test de sécurité : un identifiant piégé doit être refusé
console.log("\n5. Malicious id:");
console.log(await runTool(tools, "get_usage_history", '{"customer_id":"C1367\' OR 1=1 --"}'));

process.exit(0);