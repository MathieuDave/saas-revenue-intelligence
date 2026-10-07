import type { connectToDatabricks } from "../databricks.js";
import type { ChatMessage } from "../llm.js";
import type { AccountEvidence } from "../routes/accounts.js";
import { runAgentLoop } from "./agentLoop.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

// Les fenêtres minimales si l'agent appelle lui-même ses outils (celles du tiroir)
const MIN_TICKET_DAYS = 184; // 6 mois (du 1er mars au 31 août pour le brief d'août)
const MIN_USAGE_MONTHS = 6;

// Un échange déjà terminé, renvoyé par le navigateur à chaque question
export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

// Ce que l'agent annonce pendant qu'il travaille
export type ChatStep = { type: "tool"; tool: string };

// =========================================================
// LE PROMPT : l'Account Analyst en mode « comprendre les données »
// Il explique ; c'est Investigate (sur la carte) qui propose le plan.
// =========================================================

// "2026-05" → "May 2026" ; "2026-05-21" → "May 21, 2026"
function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Le dossier du compte, écrit en lignes simples : exactement ce que le VP voit dans le tiroir.
// (Des lignes lisibles se lisent mieux qu'un gros bloc JSON, pour un modèle comme pour nous.)
function accountFile(e: AccountEvidence): string {
  const lines: string[] = [];

  lines.push(`Company: ${e.companyName} (${e.industry}, ${e.companySize})`);
  lines.push(`Revenue: $${e.arr} a year, $${e.monthlyRevenue} a month`);
  lines.push(`Seats in ${monthLabel(e.asOf.slice(0, 7))}: ${e.activeUsers} active of ${e.licensedSeats}`);
  lines.push(
    e.nextRenewal
      ? `Next renewal: ${dayLabel(e.nextRenewal)}, in ${e.daysToRenewal} days`
      : "Next renewal: none on file"
  );

  lines.push("", "Month by month:");
  for (const m of e.history) {
    const signals = m.signals.length > 0 ? m.signals.join(", ") : "none";
    lines.push(
      `- ${monthLabel(m.month)}: ${m.activeUsers} of ${m.licensedSeats} seats active (${m.utilizationPct}%), ` +
        `$${m.monthlyRevenue} a month, ${m.tickets} tickets, ${m.feedback} feedback, signals: ${signals}`
    );
  }

  lines.push("", "Tickets and feedback, most recent first:");
  if (e.events.length === 0) lines.push("- none");
  for (const ev of e.events) {
    if (ev.kind === "ticket") {
      const age = ev.ageDays !== null && ev.detail.toLowerCase() !== "closed" ? `, open for ${ev.ageDays} days` : "";
      lines.push(`- ${dayLabel(ev.date)}: ticket, ${ev.title}, status ${ev.detail}${age}`);
    } else {
      const comment = ev.comment ? `, comment: "${ev.comment}"` : "";
      lines.push(`- ${dayLabel(ev.date)}: feedback, score ${ev.title}, ${ev.detail}${comment}`);
    }
  }

  lines.push("", "Signals raised by your agents:");
  if (e.signals.length === 0) lines.push("- none");
  for (const sig of e.signals) {
    lines.push(`- ${monthLabel(sig.month)}: ${sig.type} (${sig.direction}, ${sig.severity}). ${sig.description}`);
  }

  // La phrase calculée par une règle (déjà vérifiée) : un point d'appui sûr pour l'agent
  if (e.reading) {
    lines.push("", `Verified reading of the chart: ${e.reading}`);
  }

  return lines.join("\n");
}

function systemPrompt(evidence: AccountEvidence): string {
  const customerId = evidence.customerId;
  return `
You are the Account Analyst at RevenueAI, a B2B SaaS company that sells a data and analytics platform.
You are helping the VP Revenue of RevenueAI understand the data of ONE customer: ${customerId}.

Today is ${evidence.asOf}. Nothing after this date exists for you.

The account file below is exactly what the VP sees on screen: the last 6 months of usage and revenue, every ticket and feedback in that period, and the signals your agents raised. Answer from this file first. Use your tools only for something the file does not contain, for example an older period.

ACCOUNT FILE:
${accountFile(evidence)}

Your role here is to explain the data, not to decide. If you are asked for an action plan, who should own the account or an email to the customer, answer in one sentence that the Investigate button on the account's card prepares the plan, the owner and the email.

Rules:
- Every number and every date you write must come from the account file or from a tool result. Never estimate, never round, never merge months: copy the figures exactly as written in the file.
- For a question about why something happened, look at usage, tickets AND feedback over the whole period, starting from the month the change began.
- Only discuss customer ${customerId}. If you are asked about another customer or an unrelated topic, say you can only answer about this account.
- Never give a probability, a percentage chance or a score for churn, renewal or upgrade. If asked whether the customer will leave or renew, describe the signals and facts instead and say that you do not make predictions.
- When two things happen at the same time, say that they line up. Do not write "because", "caused" or "could have" about a cause unless the data says so, for example in a customer comment.
- Never claim that nothing else explains a change.
- If the data cannot answer the question, say so plainly.

Style:
- Plain text only: no markdown headings, no bold, no tables.
- At most 120 words.
- Write numbers with digits, like 52.6% or 14 users. Write dates in words, like May 21 or August 2026.
- Answer in the language of the question.
`.trim();
}

// =========================================================
// UNE QUESTION, avec l'historique de la conversation
// =========================================================

export async function runAccountChat(
  databricks: DatabricksClient,
  evidence: AccountEvidence,
  conversation: ChatTurn[],
  onStep: (step: ChatStep) => void
) {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(evidence) },
    ...conversation.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  const { finalText, steps, totalTokens } = await runAgentLoop(databricks, messages, {
    onToolCall: (tool) => onStep({ type: "tool", tool }),

    // GARDE-FOUS imposés par le code (un prompt n'est qu'une consigne) :
    // 1. le compte est verrouillé : quel que soit l'identifiant demandé, on lit CE compte ;
    // 2. jamais une fenêtre plus courte que celle du tiroir.
    prepareArguments: (tool, rawArguments) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(rawArguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      args.customer_id = evidence.customerId;
      if (tool === "get_support_tickets") {
        args.days = Math.max(MIN_TICKET_DAYS, Number(args.days) || 0);
      }
      if (tool === "get_usage_history") {
        args.months = Math.max(MIN_USAGE_MONTHS, Number(args.months) || 0);
      }
      return JSON.stringify(args);
    },
  }, evidence.asOf);

  // Le modèle utilise parfois des espaces et des tirets « spéciaux » (insécables) :
  // on les remplace par des caractères simples, lisibles partout
  const answer = finalText
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
  if (!answer) {
    throw new Error("The agent returned an empty answer.");
  }

  return { answer, steps, totalTokens };
}