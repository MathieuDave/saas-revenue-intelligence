import type { DeskReturn } from "./types";

// =========================================================
// LES APPELS À /api/returns (« Put back on my desk »)
// =========================================================

const API_URL = "http://localhost:3000/api";

// Les comptes remis sur le bureau ce matin-là.
// Si la table n'existe pas encore (ou le serveur échoue), le brief s'affiche quand même.
export async function fetchReturns(month: string, signal: AbortSignal): Promise<DeskReturn[]> {
  try {
    const response = await fetch(`${API_URL}/returns?month=${month}`, { signal });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    return (await response.json()) as DeskReturn[];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    console.warn("Could not load the accounts put back on the desk:", err);
    return [];
  }
}

// Remettre un compte sur le bureau ; le serveur vérifie qu'il va vraiment plus mal
export async function putBackOnDesk(month: string, customerId: string): Promise<DeskReturn> {
  const response = await fetch(`${API_URL}/returns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, customerId }),
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return (await response.json()) as DeskReturn;
}

// Retirer le compte du bureau (seulement tant que sa carte n'est pas décidée)
export async function takeOffDesk(month: string, customerId: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/returns?month=${month}&customerId=${customerId}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`API error ${response.status}`);
}
