import { connectToDatabricks } from "../databricks.js";
import { runAccountAnalyst } from "../agents/accountAnalyst.js";

console.log("Connecting to Databricks...");
const databricks = await connectToDatabricks();

console.log("\n=== Account Analyst investigating C1367 ===\n");

const result = await runAccountAnalyst(databricks, "C1367", (step) => {
  if (step.type === "thinking") console.log("💭 Thinking :", step.text);
  if (step.type === "tool_call") console.log("🔧 Calling  :", step.tool, step.arguments);
  if (step.type === "tool_result") console.log("📄 Result   :", step.result.slice(0, 160), "...");
});

console.log("\n=== Final report ===\n");
console.log(JSON.stringify(result.report, null, 2));

if (!result.report) {
  console.log("Could not read JSON. Raw answer:\n", result.rawText);
}

console.log(`\nSteps: ${result.steps} · Tokens: ${result.totalTokens}`);

process.exit(0);