import type { connectToDatabricks } from "../databricks.js";
import type { ChatMessage } from "../llm.js";
import { AS_OF_DATE } from "./tools.js";
import { runAgentLoop } from "./agentLoop.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

// =========================================================
// CE QUE L'AGENT ANNONCE PENDANT SON ENQUÊTE
// =========================================================

export type AgentStep =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; tool: string; arguments: string }
  | { type: "tool_result"; tool: string; result: string };

export type AccountReport = {
  diagnosis: string;
  evidence: string[];
  plan: string[];
  suggestedOwner: string;
  email: { subject: string; body: string };
};

// =========================================================
// LE PROMPT SYSTÈME : le « contrat de travail » de l'agent
// =========================================================

function systemPrompt(asOf: string): string {
  return `
You are the Account Analyst at RevenueAI, a B2B SaaS company that sells a data and analytics platform.
You work for the VP Revenue of RevenueAI. Your job is to protect and grow RevenueAI's recurring revenue.

Today is ${asOf}. Nothing after this date exists for you.

How you work:
- Investigate the customer with your tools BEFORE concluding. Look at the profile, the usage history, the support tickets and the feedback.
- Never invent a number. Every fact you state must come from a tool result.
- You represent RevenueAI, not the customer. Never recommend that the customer reduce licenses or spend less. Recommend actions that keep or grow the account.
- Be concrete and brief. A busy executive will read you.

The VP's team (pick the best owner):
- Julie Tremblay: Customer Success Manager for Enterprise accounts.
- Marc Gagnon: Customer Success Manager for Small and Mid-Market accounts.
- Sofia Ramirez: Account Executive, handles expansions and upsells.
- David Chen: Head of Product, for product problems.

When you are done investigating, answer with ONLY a JSON object, no other text, in this exact shape:
{
  "diagnosis": "2 or 3 sentences: what is happening and why",
  "evidence": ["one fact per item, each with its number"],
  "plan": ["3 concrete actions, in order"],
  "suggestedOwner": "one name from the team",
  "email": { "subject": "short subject", "body": "a short email to the customer's main contact" }
}
`.trim();
}

// =========================================================
// LIRE LE JSON FINAL (le modèle l'entoure parfois de ```json ... ```)
// =========================================================

function parseReport(text: string): AccountReport | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(text.slice(start, end + 1)) as AccountReport;
  } catch {
    return null;
  }
}

// =========================================================
// L'ENQUÊTE : une question fixe, un rapport structuré
// (la boucle elle-même vit dans agentLoop.ts, partagée avec la conversation)
// =========================================================

export async function runAccountAnalyst(
  databricks: DatabricksClient,
  customerId: string,
  onStep: (step: AgentStep) => void,
  asOf: string = AS_OF_DATE // la date du brief
) {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(asOf) },
    {
      role: "user",
      content: `Investigate customer ${customerId}. What is happening, and what should we do?`,
    },
  ];

  const { finalText, steps, totalTokens } = await runAgentLoop(databricks, messages, {
    onThinking: (text) => onStep({ type: "thinking", text }),
    onToolCall: (tool, args) => onStep({ type: "tool_call", tool, arguments: args }),
    onToolResult: (tool, result) => onStep({ type: "tool_result", tool, result }),
  }, asOf);

  return {
    report: parseReport(finalText),
    rawText: finalText,
    steps,
    totalTokens,
  };
}