import { randomUUID } from "node:crypto";
import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { TEAM } from "./brief.js";
import { forgetAllFollowUps, forgetFollowUps } from "./followups.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const TABLE = "workspace.saas_revenue_intelligence.vp_decisions";

// =========================================================
// CE QUE LE NAVIGATEUR A LE DROIT D'ENVOYER
// On ne fait jamais confiance au client : tout est vérifié.
// =========================================================

const KINDS = ["risk", "tradeoff", "q4", "grow"] as const;
const ACTIONS = ["delegate", "take", "later", "rebalance", "keep", "route", "send"] as const;
const TEAM_NAMES: readonly string[] = TEAM.map((m) => m.name);

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_ID = /^(C\d{4}|rebalance|q4|grow)$/;

type NewDecision = {
  month: string;
  itemId: string;
  itemKind: (typeof KINDS)[number];
  action: (typeof ACTIONS)[number];
  person: string | null;
  due: string | null;
};

// Renvoie soit la décision propre, soit un message d'erreur clair
function validate(body: unknown): NewDecision | string {
  if (typeof body !== "object" || body === null) return "The body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (typeof b.month !== "string" || !MONTH.test(b.month)) return "'month' must look like 2026-08.";
  if (typeof b.itemId !== "string" || !ITEM_ID.test(b.itemId)) return "'itemId' is not a known desk item.";
  if (!KINDS.includes(b.itemKind as NewDecision["itemKind"])) return "'itemKind' is not valid.";
  if (!ACTIONS.includes(b.action as NewDecision["action"])) return "'action' is not valid.";

  const person = b.person ?? null;
  if (person !== null && (typeof person !== "string" || !TEAM_NAMES.includes(person))) {
    return "'person' must be a member of the team.";
  }
  if ((b.action === "delegate" || b.action === "send") && person === null) {
    return "This action needs a 'person'.";
  }

  const due = b.due ?? null;
  if (due !== null && (typeof due !== "string" || !DATE.test(due))) return "'due' must look like 2026-09-04.";

  return {
    month: b.month,
    itemId: b.itemId,
    itemKind: b.itemKind as NewDecision["itemKind"],
    action: b.action as NewDecision["action"],
    person: person as string | null,
    due: due as string | null,
  };
}

// =========================================================
// OUTIL : exécuter une requête paramétrée
// =========================================================

async function run(
  databricks: DatabricksClient,
  sql: string,
  namedParameters: Record<string, string>
): Promise<DatabricksRow[]> {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(sql, {
      runAsync: true,
      namedParameters,
    });
    const rows = (await operation.fetchAll()) as DatabricksRow[];
    await operation.close();
    return rows;
  } finally {
    await session.close();
  }
}

// =========================================================
// ROUTES
// =========================================================

export function createDecisionsRouter(databricks: DatabricksClient) {
  const router = Router();

  // GET /api/decisions?month=2026-08 → les décisions de ce brief, dans l'ordre
  router.get("/decisions", async (req, res) => {
    const month = String(req.query.month ?? "");
    if (!MONTH.test(month)) {
      res.status(400).json({ error: "'month' must look like 2026-08." });
      return;
    }

    try {
      const rows = await run(
        databricks,
        `
        SELECT
          decision_id,
          item_id,
          item_kind,
          action,
          person,
          DATE_FORMAT(due_date, 'yyyy-MM-dd') AS due_date,
          decided_at
        FROM ${TABLE}
        WHERE brief_month = :month
        ORDER BY decided_at
        `,
        { month }
      );

      res.json(
        rows.map((row) => ({
          decisionId: String(row.decision_id),
          id: String(row.item_id),
          kind: String(row.item_kind),
          action: String(row.action),
          person: row.person == null ? null : String(row.person),
          due: row.due_date == null ? null : String(row.due_date),
        }))
      );
    } catch (error) {
      console.error("Decisions API error (read):", error);
      res.status(500).json({ error: "Unable to read the decisions." });
    }
  });

  // POST /api/decisions → enregistre une décision
  router.post("/decisions", async (req, res) => {
    const decision = validate(req.body);
    if (typeof decision === "string") {
      res.status(400).json({ error: decision });
      return;
    }

    const decisionId = randomUUID();
    const params = {
      decisionId,
      month: decision.month,
      itemId: decision.itemId,
      itemKind: decision.itemKind,
      action: decision.action,
      person: decision.person ?? "", // les paramètres sont du texte : '' = pas de valeur
      due: decision.due ?? "",
    };

    try {
      // 1. MERGE = « insérer SEULEMENT si cette carte n'a pas déjà une décision ce matin-là ».
      //    Une seule instruction : même si la requête arrive deux fois, la carte n'est décidée qu'une fois.
      await run(
        databricks,
        `
        MERGE INTO ${TABLE} AS t
        USING (
          SELECT
            :decisionId AS decision_id,
            :month AS brief_month,
            :itemId AS item_id,
            :itemKind AS item_kind,
            :action AS action,
            NULLIF(:person, '') AS person,
            CAST(NULLIF(:due, '') AS DATE) AS due_date
        ) AS s
        ON t.brief_month = s.brief_month AND t.item_id = s.item_id
        WHEN NOT MATCHED THEN INSERT
          (decision_id, brief_month, item_id, item_kind, action, person, due_date, decided_at)
        VALUES
          (s.decision_id, s.brief_month, s.item_id, s.item_kind, s.action, s.person, s.due_date, current_timestamp())
        `,
        params
      );

      // 2. Quelle décision est maintenant enregistrée pour cette carte ?
      const rows = await run(
        databricks,
        `
        SELECT decision_id
        FROM ${TABLE}
        WHERE brief_month = :month AND item_id = :itemId
        ORDER BY decided_at
        LIMIT 1
        `,
        { month: decision.month, itemId: decision.itemId }
      );
      const savedId = rows[0] ? String(rows[0].decision_id) : null;

      // 3. Si ce n'est pas la nôtre, la carte était déjà décidée : 409 Conflict
      if (savedId !== decisionId) {
        res.status(409).json({
          error: "This card already has a decision for this morning.",
          decisionId: savedId,
        });
        return;
      }

      // Le suivi du mois suivant juge cette décision : il doit être recalculé
      forgetFollowUps(decision.month);
      res.status(201).json({ decisionId, ...decision });
    } catch (error) {
      console.error("Decisions API error (write):", error);
      res.status(500).json({ error: "Unable to save the decision." });
    }
  });

  // DELETE /api/decisions/:decisionId → annule une décision (Undo)
  router.delete("/decisions/:decisionId", async (req, res) => {
    const decisionId = String(req.params.decisionId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(decisionId)) {
      res.status(400).json({ error: "Unknown decision id." });
      return;
    }

    try {
      await run(databricks, `DELETE FROM ${TABLE} WHERE decision_id = :decisionId`, {
        decisionId,
      });
      forgetAllFollowUps();
      res.status(204).end();
    } catch (error) {
      console.error("Decisions API error (delete):", error);
      res.status(500).json({ error: "Unable to undo the decision." });
    }
  });

  return router;
}