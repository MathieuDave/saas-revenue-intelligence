import { useEffect, useRef, useState, type FormEvent } from "react";

import { askAccount, type ChatTurn } from "./chatApi";
import "./AccountChat.css";

// =========================================================
// « ASK THE ACCOUNT ANALYST » : une conversation sur UN compte
// L'agent explique les données ; c'est Investigate (sur la carte)
// qui prépare le plan, le responsable et le courriel.
// =========================================================

// Des questions qui marchent pour n'importe quel compte
const SUGGESTIONS = [
  "What changed recently?",
  "What did the customer tell us?",
  "When did the first warning appear?",
];

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
}: {
  customerId: string;
  companyName: string;
}) {
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

      <div className="achat__chips">
        {SUGGESTIONS.map((question) => (
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