import type { connectToDatabricks } from "./databricks.js";
import { getSignalsForMonth } from "./routes/signals.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

// Le type exact de ce que renvoie getSignalsForMonth
type SignalsPayload = Awaited<ReturnType<typeof getSignalsForMonth>>;

// =========================================================
// HORLOGE DE SIMULATION (une seule pour tout le serveur)
// =========================================================

export type SimulationState = {
  month: string | null;
  index: number;
  total: number;
  isPlaying: boolean;
};

type Listener = (eventName: string, data: unknown) => void;

const TICK_MS = 2500; // 2,5 secondes par mois

// --- L'état, en mémoire du serveur ---
let months: string[] = [];
let currentIndex = 0;
let isPlaying = false;
let timer: ReturnType<typeof setInterval> | null = null;

// --- La connexion Databricks (gardée au démarrage) ---
let databricksClient: DatabricksClient | null = null;

// --- Le cache : un « mémo » des situations déjà chargées ---
const signalsCache = new Map<string, SignalsPayload>();

// --- La liste des abonnés (un par onglet connecté) ---
const listeners = new Set<Listener>();

// ---------------------------------------------------------
// Démarrage : garder Databricks et charger la liste des mois
// ---------------------------------------------------------
export async function initSimulation(databricks: DatabricksClient) {
  databricksClient = databricks;

  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(
      `
      SELECT DISTINCT DATE_FORMAT(month, 'yyyy-MM') AS month
      FROM workspace.saas_revenue_intelligence.gold_customer_monthly_health
      ORDER BY month
      `,
      { runAsync: true }
    );

    const rows = (await operation.fetchAll()) as DatabricksRow[];
    await operation.close();

    months = rows.map((row) => String(row.month));
    currentIndex = 0;

    console.log(
      `Simulation ready: ${months.length} months (${months[0]} → ${months[months.length - 1]})`
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------
// Lire l'état actuel
// ---------------------------------------------------------
export function getState(): SimulationState {
  return {
    month: months[currentIndex] ?? null,
    index: currentIndex,
    total: months.length,
    isPlaying,
  };
}

// ---------------------------------------------------------
// Situations d'un mois, avec cache
// ---------------------------------------------------------
export async function getSignals(month: string): Promise<SignalsPayload> {
  const cached = signalsCache.get(month);

  if (cached) {
    console.log(`Signals ${month}: from cache`);
    return cached;
  }

  if (!databricksClient) {
    throw new Error("Simulation is not initialized.");
  }

  const result = await getSignalsForMonth(databricksClient, month);
  signalsCache.set(month, result);

  console.log(`Signals ${month}: from Databricks`);
  return result;
}

// ---------------------------------------------------------
// S'abonner / se désabonner
// ---------------------------------------------------------
export function subscribe(listener: Listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// Prévenir TOUS les abonnés d'un coup
function broadcast(eventName: string, data: unknown) {
  for (const listener of listeners) {
    listener(eventName, data);
  }
}

// Pousser les situations d'un mois (sans bloquer l'horloge)
function publishSignals(month: string) {
  getSignals(month)
    .then((result) => broadcast("signals", result))
    .catch((error) =>
      console.error(`Unable to load signals for ${month}:`, error)
    );
}

// Pousser l'état, puis les situations du mois
function publishState() {
  const state = getState();
  broadcast("state", state);

  if (state.month) {
    publishSignals(state.month);
  }
}

// ---------------------------------------------------------
// Les commandes : play, pause, reset, seek
// ---------------------------------------------------------
export function play() {
  if (isPlaying || months.length === 0) return;

  if (currentIndex >= months.length - 1) {
    currentIndex = 0;
  }

  isPlaying = true;
  publishState();

  timer = setInterval(() => {
    if (currentIndex >= months.length - 1) {
      pause();
      return;
    }

    currentIndex += 1;
    publishState();
  }, TICK_MS);
}

export function pause() {
  isPlaying = false;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  publishState();
}

export function reset() {
  pause();
  currentIndex = 0;
  publishState();
}

export function seek(month: string) {
  const index = months.indexOf(month);
  if (index === -1) return false;

  currentIndex = index;
  publishState();
  return true;
}