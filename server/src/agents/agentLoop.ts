import type { connectToDatabricks } from "../databricks.js";
import { callModel, getReasoning, getText, type ChatMessage } from "../llm.js";
import { createTools, getToolDefinitions, runTool } from "./tools.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

// =========================================================
// LE MOTEUR COMMUN DES AGENTS
// Utilisé par l'enquête (Investigate) ET par la conversation (Ask).
// Chaque agent ne garde que ce qui lui est propre :
// son prompt, sa question, et la forme de sa réponse.
// =========================================================

// Garde-fou par défaut : jamais plus de 6 allers-retours avec le modèle
const DEFAULT_MAX_STEPS = 6;

// Ce que chaque agent peut écouter (ou modifier) pendant la boucle
export type LoopHooks = {
  onThinking?: (text: string) => void;
  onToolCall?: (tool: string, rawArguments: string) => void;
  onToolResult?: (tool: string, result: string) => void;
  // Permet de corriger les arguments AVANT d'exécuter l'outil (ex. verrouiller le compte)
  prepareArguments?: (tool: string, rawArguments: string) => string;
};

export async function runAgentLoop(
  databricks: DatabricksClient,
  messages: ChatMessage[],
  hooks: LoopHooks = {},
  maxSteps: number = DEFAULT_MAX_STEPS
) {
  const tools = createTools(databricks);
  const toolDefinitions = getToolDefinitions(tools);
  let totalTokens = 0;

  for (let step = 1; step <= maxSteps; step++) {
    // 1. Demander au modèle
    const reply = await callModel(messages, toolDefinitions);
    totalTokens += reply.usage.total_tokens;

    // 2. Annoncer sa réflexion
    const reasoning = getReasoning(reply.message);
    if (reasoning) hooks.onThinking?.(reasoning);

    const toolCalls = reply.message.tool_calls ?? [];

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
        const name = call.function.name;
        const args = hooks.prepareArguments
          ? hooks.prepareArguments(name, call.function.arguments)
          : call.function.arguments;

        hooks.onToolCall?.(name, args);
        const result = await runTool(tools, name, args);
        hooks.onToolResult?.(name, result);

        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    // 5. Sinon, c'est la réponse finale
    return { finalText: getText(reply.message), steps: step, totalTokens };
  }

  throw new Error(`The agent did not finish within ${maxSteps} steps.`);
}