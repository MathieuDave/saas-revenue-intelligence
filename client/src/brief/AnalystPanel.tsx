import { useEffect, useState } from "react";

import "./AnalystPanel.css";

// =========================================================
// L'ENQUÊTE EN DIRECT DE L'ACCOUNT ANALYST
// Le vrai agent (GPT OSS 120B + outils SQL), diffusé en SSE.
// Dans le monde des agents : la nuit.
// =========================================================

const API_URL = "http://localhost:3000/api";

// Les mêmes formes que côté serveur (server/src/agents/accountAnalyst.ts)
type AgentStep =
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

type ReportEvent = {
  report: AccountReport | null;
  rawText: string;
  steps: number;
  totalTokens: number;
};

// Le nom des outils, dit comme un humain
const SOURCES: Record<string, string> = {
  get_customer_profile: "Account profile",
  get_usage_history: "Usage history",
  get_support_tickets: "Support tickets",
  get_feedback: "Feedback",
};

// "1. Call the customer" → "Call the customer"
export function cleanItem(text: string): string {
  return text.replace(/^\s*\d+[.)]\s*/, "");
}

// Une pensée longue → une seule ligne
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}

export default function AnalystPanel({
  customerId,
  asOf,
  onReport,
}: {
  customerId: string;
  asOf: string; // la date du brief : l'agent ne lit rien après
  onReport: (report: AccountReport) => void;
}) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<ReportEvent | null>(null);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  // Ce que le serveur a dit de l'échec (ex. session Databricks expirée)
  const [failure, setFailure] = useState<{ code?: string; message?: string } | null>(null);
  const expired = failure?.code === "databricks_session_expired";

  useEffect(() => {
    const source = new EventSource(
      `${API_URL}/agents/account-analyst/${customerId}/stream?asOf=${asOf}`
    );

    source.addEventListener("step", (event) => {
      const step = JSON.parse(event.data) as AgentStep;
      setSteps((previous) => [...previous, step]);
    });

    source.addEventListener("report", (event) => {
      const data = JSON.parse(event.data) as ReportEvent;
      setResult(data);
      if (data.report) onReport(data.report);
    });

    // Flux terminé → on ferme NOUS-MÊMES (sinon EventSource relancerait l'enquête)
    source.addEventListener("done", () => {
      source.close();
      setStatus((current) => (current === "error" ? current : "done"));
    });

    // Deux cas arrivent ici : l'erreur envoyée par le serveur (avec un message)
    // ou la connexion coupée (sans message)
    source.addEventListener("error", (event) => {
      source.close();
      const data = (event as MessageEvent).data;
      if (typeof data === "string") {
        try {
          setFailure(JSON.parse(data) as { code?: string; message?: string });
        } catch {
          // message illisible → on garde le texte par défaut
        }
      }
      setStatus((current) => (current === "done" ? current : "error"));
    });

    // On ferme le panneau ou on change de carte → on coupe la connexion
    return () => source.close();
    // onReport change à chaque rendu : on ne relance l'enquête que si le client change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, asOf]);

  // Une ligne par source lue, cochée quand le résultat est arrivé
  const sources = steps
    .filter((s) => s.type === "tool_call")
    .map((call, index) => {
      const done = steps.filter((s) => s.type === "tool_result").length > index;
      return { label: SOURCES[call.tool] ?? call.tool, done };
    });

  const lastThought = [...steps].reverse().find((s) => s.type === "thinking");
  const report = result?.report ?? null;

  const statusLabel =
    status === "running"
      ? "Investigating"
      : status === "error"
        ? expired
          ? "Connection expired"
          : "Could not finish"
        : `Done, ${sources.length} sources read, ${(result?.totalTokens ?? 0).toLocaleString("en-US")} tokens`;

  return (
    <div className="analyst" aria-live="polite">
      <div className="analyst__head">
        <span className="analyst__name">Account Analyst</span>
        <span className="analyst__status">{statusLabel}</span>
      </div>

      <ul className="analyst__sources">
        {sources.map((source, index) => (
          <li key={index} className={source.done ? "analyst__source analyst__source--done" : "analyst__source"}>
            {source.label}
          </li>
        ))}
      </ul>

      {status === "running" && lastThought?.type === "thinking" && (
        <p className="analyst__thought">
          <span className="analyst__pulse" aria-hidden="true" />
          {oneLine(lastThought.text)}
        </p>
      )}

      {status === "error" && (
        <p className="analyst__thought">
          {expired
            ? failure?.message
            : "The investigation stopped before the end. Close it and try again."}
        </p>
      )}

      {report && (
        <div className="analyst__report">
          <p className="analyst__diagnosis">{report.diagnosis}</p>

          <ul className="analyst__plan">
            {report.plan.map((step) => (
              <li key={step}>{cleanItem(step)}</li>
            ))}
          </ul>

          <details className="analyst__email">
            <summary>Draft email to the customer: {report.email.subject}</summary>
            <p>{report.email.body}</p>
          </details>
        </div>
      )}

      {!report && status === "done" && result?.rawText && (
        <p className="analyst__thought">{oneLine(result.rawText)}</p>
      )}
    </div>
  );
}