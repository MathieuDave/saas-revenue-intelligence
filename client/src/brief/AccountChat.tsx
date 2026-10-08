import { useEffect, useRef, useState, type FormEvent } from "react";

import { askAccount, type ChatTurn } from "./chatApi";
import type { AccountEvidence } from "./evidenceApi";
import "./AccountChat.css";

// =========================================================
// « ASK THE ACCOUNT ANALYST » : une conversation sur UN compte
// L'agent explique les données ; c'est Investigate (sur la carte)
// qui prépare le plan, le responsable et le courriel.
// =========================================================

// Des questions qui marchent pour n'importe quel compte (pour compléter)
const GENERIC = [
  "What changed recently?",
  "When did the first warning appear?",
  "What did the customer tell us?",
];

const MAX_SUGGESTIONS = 3;

// "2026-10-15" → "October 15"
function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Les questions suggérées, choisies d'après les données du compte.
// Ce sont des questions sur les FAITS : l'agent cite les données, il ne prédit rien.
export function suggestQuestions(evidence: AccountEvidence | null): string[] {
  const picks: string[] = [];
  if (evidence) {
    const types = new Set(evidence.signals.map((s) => s.type));
    const history = evidence.history;
    const latest = history.at(-1);
    const before = history.at(-4); // trois mois plus tôt
    const usageFell =
      types.has("Usage Drop") ||
      (latest !== undefined && before !== undefined && before.utilizationPct - latest.utilizationPct >= 10);
    const usageRose =
      latest !== undefined && before !== undefined && latest.utilizationPct - before.utilizationPct >= 10;
    const openTickets = evidence.events.filter(
      (e) => e.kind === "ticket" && e.detail.toLowerCase() !== "closed"
    ).length;
    const hasComments = evidence.events.some((e) => e.kind === "feedback" && e.comment);

    if (usageFell) picks.push("What happened around the time usage dropped?");
    if (openTickets > 0) {
      picks.push(openTickets === 1 ? "What is the open ticket about?" : `What are the ${openTickets} open tickets about?`);
    } else if (types.has("Support Spike")) {
      picks.push("Which problems keep coming back in support?");
    }
    if (types.has("Negative Feedback") || hasComments) picks.push("What did the customer say in their feedback?");
    if (usageRose) picks.push("How has usage grown over the last months?");
    if (evidence.nextRenewal && evidence.daysToRenewal !== null && evidence.daysToRenewal <= 120) {
      picks.push(`What changed since the last renewal, before the one on ${dayLabel(evidence.nextRenewal)}?`);
    }
  }
  // On complète avec les questions génériques, sans doublon de sujet
  for (const question of GENERIC) {
    if (picks.length >= MAX_SUGGESTIONS) break;
    const feedbackTwice = question.includes("customer tell") && picks.some((p) => p.includes("feedback"));
    if (!picks.includes(question) && !feedbackTwice) picks.push(question);
  }
  return picks.slice(0, MAX_SUGGESTIONS);
}

// Ce que l'agent fait, en mots simples
const TOOL_LABELS: Record<string, string> = {
  get_customer_profile: "Reading the account profile",
  get_usage_history: "Reading usage history",
  get_support_tickets: "Checking support tickets",
  get_feedback: "Reading feedback",
};

// Le serveur accepte 12 messages : on garde les 5 derniers échanges + la nouvelle question
const MAX_EXCHANGES_SENT = 5;

type Exchange = {
  question: string;
  steps: string[];
  answer: string | null;
  error: string | null;
};

export default function AccountChat({
  customerId,
  companyName,
  asOf,
  evidence = null,
}: {
  customerId: string;
  companyName: string;
  asOf: string; // la date du brief
  evidence?: AccountEvidence | null; // les données du tiroir, pour choisir les suggestions
}) {
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Une question déjà posée disparaît des suggestions
  const asked = new Set(thread.map((e) => e.question));
  const suggestions = suggestQuestions(evidence).filter((q) => !asked.has(q));

  // Si le tiroir se ferme pendant une réponse, on annule la requête
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // À chaque nouvel échange, on fait défiler jusqu'à lui
  // (pas à l'ouverture du tiroir : il resterait en haut)
  useEffect(() => {
    if (thread.length === 0) return;
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [thread.length]);

  // Met à jour le DERNIER échange (celui en cours)
  function updateLast(change: (e: Exchange) => Exchange) {
    setThread((current) => {
      const last = current[current.length - 1];
      if (!last) return current;
      return [...current.slice(0, -1), change(last)];
    });
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    // La conversation envoyée : les échanges terminés, puis la nouvelle question
    const history: ChatTurn[] = thread
      .filter((e) => e.answer !== null)
      .slice(-MAX_EXCHANGES_SENT)
      .flatMap((e) => [
        { role: "user" as const, content: e.question },
        { role: "assistant" as const, content: e.answer ?? "" },
      ]);
    const messages: ChatTurn[] = [...history, { role: "user", content: text }];

    setThread((current) => [...current, { question: text, steps: [], answer: null, error: null }]);
    setDraft("");
    setBusy(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await askAccount(
        customerId,
        asOf,
        messages,
        (event) => {
          if (event.type === "step") {
            const label = TOOL_LABELS[event.tool] ?? "Looking at the data";
            updateLast((e) => ({ ...e, steps: [...e.steps, label] }));
          }
          if (event.type === "answer") updateLast((e) => ({ ...e, answer: event.text }));
          if (event.type === "error") updateLast((e) => ({ ...e, error: event.message }));
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      updateLast((e) => ({
        ...e,
        error: "The Account Analyst could not answer. Check that the backend is running.",
      }));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <section className="achat" aria-labelledby={`achat-${customerId}`}>
      <h3 className="achat__title" id={`achat-${customerId}`}>
        <span className="achat__dot" aria-hidden="true" />
        Ask the Account Analyst about {companyName}
      </h3>
      <p className="achat__sub">
        It reads the same data as this drawer, and nothing after the date of the brief.
      </p>

      {suggestions.length > 0 && (
        <p className="achat__hint">{thread.length === 0 ? "Suggested for this account" : "You could also ask"}</p>
      )}
      <div className="achat__chips">
        {suggestions.map((question) => (
          <button
            key={question}
            type="button"
            className="achat__chip"
            disabled={busy}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="achat__thread" aria-live="polite">
        {thread.map((exchange, index) => {
          const pending = exchange.answer === null && exchange.error === null;
          return (
            <div key={index} className="achat__exchange">
              <div className="achat__question">{exchange.question}</div>
              <div className="achat__who">Account Analyst</div>

              {(pending || exchange.steps.length > 0) && (
                <ul className="achat__steps">
                  {exchange.steps.map((step, i) => (
                    <li key={i}>
                      <span className="achat__tick" aria-hidden="true" />
                      {step}
                    </li>
                  ))}
                  {pending && (
                    <li>
                      <span className="achat__tick achat__tick--live" aria-hidden="true" />
                      {exchange.steps.length === 0 ? "Reading the account file…" : "Writing the answer…"}
                    </li>
                  )}
                </ul>
              )}

              {exchange.answer && <p className="achat__answer">{exchange.answer}</p>}
              {exchange.error && <p className="achat__error">{exchange.error}</p>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="achat__composer" onSubmit={onSubmit}>
        <label className="achat__label" htmlFor={`achat-input-${customerId}`}>
          Ask a question about this account
        </label>
        <input
          id={`achat-input-${customerId}`}
          type="text"
          value={draft}
          maxLength={1000}
          placeholder="Ask anything about this account…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="achat__send" disabled={busy || draft.trim() === ""}>
          Ask
        </button>
      </form>

      <p className="achat__foot">
        The agent quotes the data and never gives a churn probability. For a plan, an owner or an
        email, use Investigate on the card. The conversation is forgotten when you close the drawer.
      </p>
    </section>
  );
}