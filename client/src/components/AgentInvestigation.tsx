import { useEffect, useState } from "react";

import "./AgentInvestigation.css";

// Les mêmes formes que côté serveur
type AgentStep =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; tool: string; arguments: string }
  | { type: "tool_result"; tool: string; result: string };

type AccountReport = {
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

type AgentInvestigationProps = {
  customerId: string;
  companyName: string;
};

const API_URL = "http://localhost:3000/api";

// {"customer_id":"C1367","months":6} → "customer_id: C1367, months: 6"
function formatArguments(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
  } catch {
    return raw;
  }
}

// Un résumé lisible de ce que l'outil a renvoyé
function summarizeResult(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "No records found";
      return `${parsed.length} record${parsed.length > 1 ? "s" : ""} received`;
    }

    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return `Error: ${String((parsed as { error: unknown }).error)}`;
    }

    return "Data received";
  } catch {
    return "Data received";
  }
}

// "1. License use fell…" → "License use fell…" (la liste numérote déjà)
function cleanItem(text: string) {
  return text.replace(/^\s*\d+\.\s*/, "");
}

function AgentInvestigation({ customerId, companyName }: AgentInvestigationProps) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<ReportEvent | null>(null);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");

  useEffect(() => {
    const source = new EventSource(
      `${API_URL}/agents/account-analyst/${customerId}/stream`
    );

    // Chaque étape arrive en direct et s'ajoute à la liste
    source.addEventListener("step", (event) => {
      const step = JSON.parse(event.data) as AgentStep;
      setSteps((previous) => [...previous, step]);
    });

    // Le rapport final
    source.addEventListener("report", (event) => {
      setResult(JSON.parse(event.data) as ReportEvent);
    });

    // IMPORTANT : flux terminé → on ferme NOUS-MÊMES,
    // sinon EventSource se reconnecterait et relancerait l'enquête
    source.addEventListener("done", () => {
      source.close();
      setStatus((current) => (current === "error" ? current : "done"));
    });

    // Erreur envoyée par le serveur, ou connexion perdue
    source.addEventListener("error", () => {
      source.close();
      setStatus((current) => (current === "done" ? current : "error"));
    });

    // On quitte ou on ferme le panneau → on coupe la connexion
    return () => source.close();
  }, [customerId]);

  const report = result?.report ?? null;

  const statusLabel =
    status === "running"
      ? "Investigating…"
      : status === "error"
        ? "Failed"
        : `Done · ${result?.steps ?? 0} steps · ${(result?.totalTokens ?? 0).toLocaleString("en-US")} tokens`;

  return (
    <div className="agent-panel">
      <div className="agent-panel-header">
        <span className="agent-badge">AA</span>
        <span className="agent-title">Account Analyst · {companyName}</span>
        <span className={`agent-status agent-status--${status}`}>{statusLabel}</span>
      </div>

      <ol className="agent-steps">
        {steps.map((step, index) => (
          <li key={index} className={`agent-step agent-step--${step.type}`}>
            {step.type === "thinking" && (
              <>
                <span className="agent-step-label">Thinking</span>
                <p>{step.text}</p>
              </>
            )}

            {step.type === "tool_call" && (
              <code>
                → {step.tool}({formatArguments(step.arguments)})
              </code>
            )}

            {step.type === "tool_result" && (
              <span className="agent-step-result">✓ {summarizeResult(step.result)}</span>
            )}
          </li>
        ))}
      </ol>

      {status === "running" && <p className="agent-working">Working…</p>}

      {status === "error" && (
        <p className="agent-error">The investigation failed. Please try again.</p>
      )}

      {report && (
        <div className="agent-report">
          <section>
            <h4>Diagnosis</h4>
            <p>{report.diagnosis}</p>
          </section>

          <section>
            <h4>Evidence</h4>
            <ul>
              {report.evidence.map((item, index) => (
                <li key={index}>{cleanItem(item)}</li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Plan</h4>
            <ol>
              {report.plan.map((item, index) => (
                <li key={index}>{cleanItem(item)}</li>
              ))}
            </ol>
          </section>

          <section>
            <h4>Suggested owner</h4>
            <p>{report.suggestedOwner}</p>
          </section>

          <section className="agent-email">
            <h4>Draft email · {report.email.subject}</h4>
            <p>{report.email.body}</p>
          </section>
        </div>
      )}

      {!report && status === "done" && result?.rawText && (
        <pre className="agent-raw">{result.rawText}</pre>
      )}
    </div>
  );
}

export default AgentInvestigation;