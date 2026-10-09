import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// =========================================================
// CONFIGURATION
// =========================================================

// Le même profil OAuth que Genie (défini dans .env)
const profile = process.env.DATABRICKS_CONFIG_PROFILE;

// L'adresse de ton espace Databricks, sans "https://"
const host = (process.env.DATABRICKS_SERVER_HOSTNAME ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

// Le modèle choisi. Changer de modèle = changer ces 2 lignes.
const MODEL_ENDPOINT = "databricks-gpt-oss-120b";
const MODEL_NAME = "system.ai.gpt-oss-120b";

// =========================================================
// TYPES (le format standard des conversations)
// =========================================================

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ContentBlock = {
  type: string;
  text?: string;
  summary?: { type: string; text: string }[];
};

export type AssistantMessage = {
  role: "assistant";
  content: ContentBlock[] | string | null;
  tool_calls?: ToolCall[];
};

export type ModelReply = {
  message: AssistantMessage;
  finishReason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// =========================================================
// JETON : obtenu via le CLI Databricks, gardé en cache
// =========================================================

// Une erreur à part : les routes la reconnaissent et l'expliquent clairement
export class SessionExpiredError extends Error {
  constructor(profile: string) {
    super(
      `Databricks session expired. Run: databricks auth login --profile ${profile} ` +
        `then try again (no need to restart the backend).`
    );
    this.name = "SessionExpiredError";
  }
}

// Ce qu'une route d'agent envoie au navigateur quand ça plante.
// La commande de reconnexion va dans le terminal, la page garde un message neutre.
export function agentErrorEvent(
  error: unknown,
  fallback: string
): { code: string; message: string } {
  if (error instanceof SessionExpiredError) {
    console.error(`\n>>> ${error.message}\n`);
    return {
      code: "databricks_session_expired",
      message: "The data connection expired. Reconnect to Databricks, then try again.",
    };
  }
  return { code: "agent_failed", message: fallback };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  // 1. Jeton encore valide en mémoire → on le réutilise
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  if (!profile) {
    throw new Error("DATABRICKS_CONFIG_PROFILE is missing from .env");
  }

  // 2. Sinon, on lance la même commande que dans le terminal
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("databricks", ["auth", "token", "-p", profile]));
  } catch (error) {
    // Le CLI refuse de donner un jeton : la session Databricks a expiré
    const text = error instanceof Error ? error.message : String(error);
    if (/refresh token|invalid_grant|auth login/i.test(text)) {
      throw new SessionExpiredError(profile);
    }
    throw error;
  }

  const parsed = JSON.parse(stdout) as {
    access_token: string;
    expiry?: string;
  };

  // 3. On le garde jusqu'à 5 minutes avant son expiration
  const expiry = parsed.expiry
    ? new Date(parsed.expiry).getTime()
    : Date.now() + 30 * 60 * 1000;

  cachedToken = {
    value: parsed.access_token,
    expiresAt: expiry - 5 * 60 * 1000,
  };

  return parsed.access_token;
}

// =========================================================
// APPEL AU MODÈLE
// =========================================================

export async function callModel(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<ModelReply> {
  const token = await getToken();

  const response = await fetch(
    `https://${host}/serving-endpoints/${MODEL_ENDPOINT}/invocations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        tools,
        max_tokens: 2000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Model call failed (${response.status}): ${errorText.slice(0, 300)}`
    );
  }

  const data = (await response.json()) as {
    choices: { message: AssistantMessage; finish_reason: string }[];
    usage: ModelReply["usage"];
  };

    // La réponse doit contenir au moins un choix
  const choice = data.choices[0];

  if (!choice) {
    throw new Error("Model returned no choices.");
  }

  return {
    message: choice.message,
    finishReason: choice.finish_reason,
    usage: data.usage,
  };
}

// =========================================================
// LIRE LA RÉPONSE (le contenu est une liste de blocs)
// =========================================================

// La réponse finale : les blocs de type "text"
export function getText(message: AssistantMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!message.content) return "";

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

// La réflexion de l'agent : les blocs de type "reasoning"
export function getReasoning(message: AssistantMessage): string {
  if (!Array.isArray(message.content)) return "";

  return message.content
    .filter((block) => block.type === "reasoning")
    .flatMap((block) => block.summary ?? [])
    .map((item) => item.text)
    .join("\n");
}