import { callModel, getText, getReasoning } from "../llm.js";

console.log("Starting test...");

// Un test isolé : on appelle le modèle sans passer par le serveur Express
const reply = await callModel([
  { role: "user", content: "Say hello in one short sentence." },
]);

console.log("Finish reason:", reply.finishReason);
console.log("Reasoning    :", getReasoning(reply.message));
console.log("Answer       :", getText(reply.message));
console.log("Tokens used  :", reply.usage.total_tokens);