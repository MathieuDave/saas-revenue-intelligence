import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { getFollowUps } from "./followups.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";
const TABLE = `${SCHEMA}.vp_desk_returns`;

// =========================================================
// « PUT BACK ON MY DESK »
// Un compte qui va plus mal depuis la décision du mois dernier
// peut revenir sur le bureau du VP. Le serveur vérifie lui-même
// que le compte va vraiment plus mal : on ne fait pas confiance au client.
// =========================================================

const MONTH = /^\d{4}-\d{2}$/;
const CUSTOMER_ID = /^C\d{4}$/;

// Seuls ces statuts peuvent revenir : un compte parti (« lost ») n'a plus de décision à prendre
const CAN_RETURN = ["worse", "shrank"];

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

// Une ligne de la table → ce que le client reçoit
function toReturn(row: DatabricksRow) {
  return {
    customerId: String(row.customer_id),
    companyName: String(row.company_name),
    status: String(row.status),
    reading: String(row.reading),
    arr: Number(row.arr ?? 0),
    previousAction: row.previous_action == null ? null : String(row.previous_action),
    previousPerson: row.previous_person == null ? null : String(row.previous_person),
  };
}

export function createReturnsRouter(databricks: DatabricksClient) {
  const router = Router();

  // GET /api/returns?month=2026-08 → les comptes remis sur le bureau ce matin-là
  router.get("/returns", async (req, res) => {
    const month = String(req.query.month ?? "");
    if (!MONTH.test(month)) {
      res.status(400).json({ error: "'month' must look like 2026-08." });
      return;
    }

    try {
      const rows = await run(
        databricks,
        `
        SELECT customer_id, company_name, status, reading, arr, previous_action, previous_person
        FROM ${TABLE}
        WHERE brief_month = :month
        ORDER BY returned_at
        `,
        { month }
      );
      res.json(rows.map(toReturn));
    } catch (error) {
      console.error("Returns API error (read):", error);
      res.status(500).json({ error: "Unable to read the accounts put back on the desk." });
    }
  });

  // POST /api/returns { month, customerId } → remet le compte sur le bureau
  router.post("/returns", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const month = String(body.month ?? "");
    const customerId = String(body.customerId ?? "");
    if (!MONTH.test(month) || !CUSTOMER_ID.test(customerId)) {
      res.status(400).json({ error: "Send a 'month' like 2026-08 and a 'customerId' like C0235." });
      return;
    }

    try {
      // 1. Le serveur refait le suivi : le compte va-t-il vraiment plus mal ?
      const followUps = await getFollowUps(databricks, month);
      const followUp = followUps.find((f) => f.customerId === customerId);
      if (!followUp || !CAN_RETURN.includes(followUp.status)) {
        res.status(400).json({ error: "This account did not get worse since your last decision." });
        return;
      }

      // 2. On garde une photo du suivi (ce que le VP a vu en cliquant).
      //    MERGE : si le compte est déjà revenu ce matin-là, on ne l'ajoute pas deux fois.
      await run(
        databricks,
        `
        MERGE INTO ${TABLE} AS t
        USING (
          SELECT
            :month AS brief_month,
            :customerId AS customer_id,
            :companyName AS company_name,
            :status AS status,
            :reading AS reading,
            CAST(:arr AS DOUBLE) AS arr,
            :previousAction AS previous_action,
            NULLIF(:previousPerson, '') AS previous_person
        ) AS s
        ON t.brief_month = s.brief_month AND t.customer_id = s.customer_id
        WHEN NOT MATCHED THEN INSERT
          (brief_month, customer_id, company_name, status, reading, arr, previous_action, previous_person, returned_at)
        VALUES
          (s.brief_month, s.customer_id, s.company_name, s.status, s.reading, s.arr, s.previous_action, s.previous_person, current_timestamp())
        `,
        {
          month,
          customerId,
          companyName: followUp.companyName,
          status: followUp.status,
          reading: followUp.reading,
          arr: String((followUp.revenueAfter ?? 0) * 12), // l'ARR d'aujourd'hui
          previousAction: followUp.action,
          previousPerson: followUp.person ?? "",
        }
      );

      res.status(201).json(
        toReturn({
          customer_id: customerId,
          company_name: followUp.companyName,
          status: followUp.status,
          reading: followUp.reading,
          arr: (followUp.revenueAfter ?? 0) * 12,
          previous_action: followUp.action,
          previous_person: followUp.person,
        })
      );
    } catch (error) {
      console.error("Returns API error (write):", error);
      res.status(500).json({ error: "Unable to put the account back on the desk." });
    }
  });

  // DELETE /api/returns?month=2026-08&customerId=C0235 → retire le compte du bureau
  // Seulement tant qu'aucune décision n'a été prise sur sa carte.
  router.delete("/returns", async (req, res) => {
    const month = String(req.query.month ?? "");
    const customerId = String(req.query.customerId ?? "");
    if (!MONTH.test(month) || !CUSTOMER_ID.test(customerId)) {
      res.status(400).json({ error: "Send a 'month' like 2026-08 and a 'customerId' like C0235." });
      return;
    }

    try {
      const decided = await run(
        databricks,
        `
        SELECT COUNT(*) AS n
        FROM ${SCHEMA}.vp_decisions
        WHERE brief_month = :month AND item_id = :customerId
        `,
        { month, customerId }
      );
      if (Number(decided[0]?.n ?? 0) > 0) {
        res.status(409).json({ error: "This card already has a decision. Undo it first." });
        return;
      }

      await run(
        databricks,
        `DELETE FROM ${TABLE} WHERE brief_month = :month AND customer_id = :customerId`,
        { month, customerId }
      );
      res.status(204).end();
    } catch (error) {
      console.error("Returns API error (delete):", error);
      res.status(500).json({ error: "Unable to take the account off the desk." });
    }
  });

  return router;
}
