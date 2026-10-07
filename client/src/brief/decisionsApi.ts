import type { Decision, DeskItem } from "./deskItems";

// =========================================================
// LES APPELS À /api/decisions
// Toute la communication avec le serveur au même endroit.
// =========================================================

const API_URL = "http://localhost:3000/api";

// Relire les décisions déjà prises pour ce brief
export async function fetchDecisions(
  month: string,
  signal: AbortSignal
): Promise<Decision[]> {
  const response = await fetch(`${API_URL}/decisions?month=${month}`, { signal });
  if (!response.ok) throw new Error(`API error ${response.status}`);

  const rows = (await response.json()) as Array<{
    decisionId: string;
    id: string;
    action: Decision["action"];
    person: string | null;
    due: string | null;
  }>;

  return rows.map((row) => ({
    decisionId: row.decisionId,
    id: row.id,
    action: row.action,
    person: row.person,
    due: row.due,
  }));
}

// Le serveur refuse une 2e décision pour la même carte du même matin (409)
export class AlreadyDecidedError extends Error {
  constructor() {
    super("This card already has a decision for this morning.");
    this.name = "AlreadyDecidedError";
  }
}

// Enregistrer une décision ; renvoie l'identifiant créé par le serveur
export async function saveDecision(
  month: string,
  item: DeskItem,
  decision: Decision
): Promise<string> {
  const response = await fetch(`${API_URL}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      month,
      itemId: item.id,
      itemKind: item.kind,
      action: decision.action,
      person: decision.person,
      due: decision.due,
    }),
  });
  if (response.status === 409) throw new AlreadyDecidedError();
  if (!response.ok) throw new Error(`API error ${response.status}`);

  const saved = (await response.json()) as { decisionId: string };
  return saved.decisionId;
}

// Annuler une décision (Undo)
export async function deleteDecision(decisionId: string): Promise<void> {
  const response = await fetch(`${API_URL}/decisions/${decisionId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
}