import type { connectToDatabricks } from "../databricks.js";
import {
  callModel,
  getReasoning,
  getText,
  type ChatMessage,
} from "../llm.js";
import {
  AS_OF_DATE,
  createTools,
  getToolDefinitions,
  runTool,
} from "./tools.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

// Garde-fou : jamais plus de 6 allers-retours avec le modèle
const MAX_STEPS = 6;

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

const SYSTEM_PROMPT = `
You are the Account Analyst at RevenueAI, a B2B SaaS company that sells a data and analytics platform.
You work for the VP Revenue of RevenueAI. Your job is to protect and grow RevenueAI's recurring revenue.

Today is ${AS_OF_DATE}.

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
// LA BOUCLE D'AGENT
// =========================================================

export async function runAccountAnalyst(
  databricks: DatabricksClient,
  customerId: string,
  onStep: (step: AgentStep) => void
) {
  const tools = createTools(databricks);
  const toolDefinitions = getToolDefinitions(tools);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Investigate customer ${customerId}. What is happening, and what should we do?`,
    },
  ];

  let totalTokens = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    // 1. Demander au modèle
    const reply = await callModel(messages, toolDefinitions);
    totalTokens += reply.usage.total_tokens;

    // 2. Annoncer sa réflexion
    const reasoning = getReasoning(reply.message);
    if (reasoning) onStep({ type: "thinking", text: reasoning });

    const toolCalls = reply.message.tool_calls ?? [];

    // 3. Garder sa réponse dans la conversation (sans les blocs de réflexion)
        // 3. Garder sa réponse dans la conversation (sans les blocs de réflexion)
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: getText(reply.message) || null,
    };

    // On ajoute tool_calls SEULEMENT s'il y en a (sinon le champ reste absent)
    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls;
    }

    messages.push(assistantMessage);

    // 4. Il veut des outils → on les exécute et on recommence
    if (reply.finishReason === "tool_calls" && toolCalls.length > 0) {
      for (const call of toolCalls) {
        onStep({
          type: "tool_call",
          tool: call.function.name,
          arguments: call.function.arguments,
        });

        const result = await runTool(
          tools,
          call.function.name,
          call.function.arguments
        );

        onStep({ type: "tool_result", tool: call.function.name, result });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    // 5. Sinon, c'est la réponse finale
    const finalText = getText(reply.message);

    return {
      report: parseReport(finalText),
      rawText: finalText,
      steps: step,
      totalTokens,
    };
  }

  throw new Error(`The agent did not finish within ${MAX_STEPS} steps.`);
}