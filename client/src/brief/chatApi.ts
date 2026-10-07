// =========================================================
// « ASK THE ACCOUNT ANALYST » : parler à l'agent depuis le tiroir
// Le miroir de POST /api/accounts/:customerId/ask
// =========================================================

const API_URL = "http://localhost:3000/api";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatEvent =
  | { type: "step"; tool: string }
  | { type: "answer"; text: string }
  | { type: "error"; message: string };

// EventSource ne sait faire que des GET. Ici on envoie la conversation en POST,
// donc on lit le flux nous-mêmes : des blocs séparés par une ligne vide,
// chacun avec une ligne « event: … » et une ligne « data: … ».
export async function askAccount(
  customerId: string,
  messages: ChatTurn[],
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_URL}/accounts/${customerId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`API error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Traiter chaque bloc complet (un bloc se termine par une ligne vide)
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf("\n\n");

      let name = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) name = line.slice(7);
        if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;

      const payload = JSON.parse(data) as Record<string, unknown>;
      if (name === "step") onEvent({ type: "step", tool: String(payload.tool ?? "") });
      if (name === "answer") onEvent({ type: "answer", text: String(payload.text ?? "") });
      if (name === "error") onEvent({ type: "error", message: String(payload.message ?? "") });
    }
  }
}