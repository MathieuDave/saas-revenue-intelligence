import type { connectToDatabricks } from "../databricks.js";
import type { ToolDefinition } from "../llm.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type Row = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// La « date du jour » pour l'agent : la fin de tes données.
// Plus tard, on la reliera à l'horloge de simulation.
export const AS_OF_DATE = "2026-08-31";

// =========================================================
// OUTILS INTERNES
// =========================================================

// Exécute une requête paramétrée et renvoie les lignes
async function query(
  databricks: DatabricksClient,
  sql: string,
  params: Record<string, string>
): Promise<Row[]> {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(sql, {
      runAsync: true,
      namedParameters: params,
    });

    try {
      return (await operation.fetchAll()) as Row[];
    } finally {
      await operation.close();
    }
  } finally {
    await session.close();
  }
}

// Le modèle doit envoyer un identifiant du type C1367, rien d'autre
function isValidCustomerId(value: unknown): value is string {
  return typeof value === "string" && /^C\d{4}$/.test(value);
}

// Force un nombre entre min et max (valeur par défaut si invalide)
function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// "2026-08-31" moins N jours → "2026-06-02"
function daysBefore(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// =========================================================
// LES OUTILS : une description (pour le modèle) + du code (pour nous)
// =========================================================

type Tool = {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export type ToolRegistry = Record<string, Tool>;

export function createTools(databricks: DatabricksClient): ToolRegistry {
  return {
    // ---------------------------------------------------------
    get_customer_profile: {
      definition: {
        type: "function",
        function: {
          name: "get_customer_profile",
          description:
            "Returns who the customer is: company name, industry, size, status, current monthly revenue and current license utilization.",
          parameters: {
            type: "object",
            properties: {
              customer_id: { type: "string", description: "Customer id, for example C1367" },
            },
            required: ["customer_id"],
          },
        },
      },
      execute: async (args) => {
        const rows = await query(
          databricks,
          `
          SELECT
            c.customer_id, c.company_name, c.industry, c.company_size, c.customer_status,
            h.ending_mrr, h.license_utilization_pct
          FROM ${SCHEMA}.customers c
          LEFT JOIN ${SCHEMA}.gold_customer_monthly_health h
            ON c.customer_id = h.customer_id
           AND h.month = DATE_TRUNC('MONTH', CAST(:as_of AS TIMESTAMP))
          WHERE c.customer_id = :customer_id
          `,
          { customer_id: String(args.customer_id), as_of: AS_OF_DATE }
        );

        const row = rows[0];
        if (!row) return { error: `No customer found with id ${String(args.customer_id)}.` };

        const mrr = Number(row.ending_mrr ?? 0);

        return {
          customerId: String(row.customer_id),
          companyName: String(row.company_name),
          industry: String(row.industry),
          companySize: String(row.company_size),
          status: String(row.customer_status),
          monthlyRevenue: mrr,
          annualRevenue: mrr * 12,
          licenseUtilizationPct: Number(row.license_utilization_pct ?? 0),
        };
      },
    },

    // ---------------------------------------------------------
    get_usage_history: {
      definition: {
        type: "function",
        function: {
          name: "get_usage_history",
          description:
            "Returns the customer's monthly license utilization, active users and revenue, most recent month first.",
          parameters: {
            type: "object",
            properties: {
              customer_id: { type: "string", description: "Customer id, for example C1367" },
              months: { type: "integer", description: "How many months to return (1 to 18). Default 6." },
            },
            required: ["customer_id"],
          },
        },
      },
      execute: async (args) => {
        const months = clampInt(args.months, 1, 18, 6);

        const rows = await query(
          databricks,
          `
          SELECT
            DATE_FORMAT(month, 'yyyy-MM') AS month,
            license_utilization_pct, active_users, licensed_seats, ending_mrr
          FROM ${SCHEMA}.gold_customer_monthly_health
          WHERE customer_id = :customer_id
            AND month <= CAST(:as_of AS TIMESTAMP)
          ORDER BY month DESC
          `,
          { customer_id: String(args.customer_id), as_of: AS_OF_DATE }
        );

        return rows.slice(0, months).map((row) => ({
          month: String(row.month),
          licenseUtilizationPct: Number(row.license_utilization_pct ?? 0),
          activeUsers: Number(row.active_users ?? 0),
          licensedSeats: Number(row.licensed_seats ?? 0),
          monthlyRevenue: Number(row.ending_mrr ?? 0),
        }));
      },
    },

    // ---------------------------------------------------------
    get_support_tickets: {
      definition: {
        type: "function",
        function: {
          name: "get_support_tickets",
          description:
            "Returns the customer's support tickets opened in the last N days, with severity, category and status.",
          parameters: {
            type: "object",
            properties: {
              customer_id: { type: "string", description: "Customer id, for example C1367" },
              days: { type: "integer", description: "Look-back window in days (1 to 365). Default 90." },
            },
            required: ["customer_id"],
          },
        },
      },
      execute: async (args) => {
        const days = clampInt(args.days, 1, 365, 90);

        const rows = await query(
          databricks,
          `
          SELECT
            DATE_FORMAT(opened_date, 'yyyy-MM-dd') AS opened,
            severity, category, status
          FROM ${SCHEMA}.support_tickets
          WHERE customer_id = :customer_id
            AND CAST(opened_date AS DATE) BETWEEN CAST(:start_date AS DATE) AND CAST(:as_of AS DATE)
          ORDER BY opened_date DESC
          `,
          {
            customer_id: String(args.customer_id),
            start_date: daysBefore(AS_OF_DATE, days),
            as_of: AS_OF_DATE,
          }
        );

        return rows.map((row) => ({
          opened: String(row.opened),
          severity: String(row.severity),
          category: String(row.category),
          status: String(row.status),
        }));
      },
    },

    // ---------------------------------------------------------
    get_feedback: {
      definition: {
        type: "function",
        function: {
          name: "get_feedback",
          description:
            "Returns the customer's most recent feedback: date, score from 1 to 5, sentiment and comment.",
          parameters: {
            type: "object",
            properties: {
              customer_id: { type: "string", description: "Customer id, for example C1367" },
              limit: { type: "integer", description: "How many feedback entries to return (1 to 10). Default 5." },
            },
            required: ["customer_id"],
          },
        },
      },
      execute: async (args) => {
        const limit = clampInt(args.limit, 1, 10, 5);

        const rows = await query(
          databricks,
          `
          SELECT
            DATE_FORMAT(feedback_date, 'yyyy-MM-dd') AS date,
            score, sentiment, comment
          FROM ${SCHEMA}.customer_feedback
          WHERE customer_id = :customer_id
            AND CAST(feedback_date AS DATE) <= CAST(:as_of AS DATE)
          ORDER BY feedback_date DESC
          `,
          { customer_id: String(args.customer_id), as_of: AS_OF_DATE }
        );

        return rows.slice(0, limit).map((row) => ({
          date: String(row.date),
          score: Number(row.score ?? 0),
          sentiment: String(row.sentiment),
          comment: String(row.comment ?? ""),
        }));
      },
    },
  };
}

// =========================================================
// UTILISÉ PAR LA BOUCLE D'AGENT
// =========================================================

// Les descriptions à envoyer au modèle
export function getToolDefinitions(tools: ToolRegistry): ToolDefinition[] {
  return Object.values(tools).map((tool) => tool.definition);
}

// Exécute l'outil demandé par le modèle, de façon sûre.
// Renvoie TOUJOURS un texte JSON (jamais d'exception) : en cas de problème,
// le modèle reçoit un message d'erreur et peut se corriger.
export async function runTool(
  tools: ToolRegistry,
  name: string,
  rawArguments: string
): Promise<string> {
  const tool = tools[name];

  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  let args: Record<string, unknown>;

  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: "Tool arguments are not valid JSON." });
  }

  if (!isValidCustomerId(args.customer_id)) {
    return JSON.stringify({
      error: "customer_id must look like C1367 (the letter C followed by 4 digits).",
    });
  }

  try {
    const result = await tool.execute(args);
    return JSON.stringify(result);
  } catch (error) {
    console.error(`Tool ${name} failed:`, error);
    return JSON.stringify({ error: `Tool ${name} failed while reading the data.` });
  }
}