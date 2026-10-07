import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { runAccountAnalyst } from "../agents/accountAnalyst.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

export function createAgentsRouter(databricks: DatabricksClient) {
  const router = Router();

  // =========================================================
  // ENQUÊTE DE L'ACCOUNT ANALYST, EN DIRECT (SSE)
  // GET /api/agents/account-analyst/C1367/stream
  // =========================================================

  router.get(
    "/agents/account-analyst/:customerId/stream",
    async (req, res) => {
      const customerId = String(req.params.customerId);

      // 1. Valider l'entrée AVANT de lancer quoi que ce soit (ça coûte des jetons)
      if (!/^C\d{4}$/.test(customerId)) {
        res.status(400).json({
          error: "customerId must look like C1367 (the letter C followed by 4 digits).",
        });
        return;
      }

      // 2. Ouvrir le flux SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // 3. Si le client part en cours de route, on arrête d'écrire
      let closed = false;
      req.on("close", () => {
        closed = true;
      });

      function send(eventName: string, data: unknown) {
        if (closed) return;
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      console.log(`Account Analyst started for ${customerId}`);
      send("start", { customerId });

      try {
        // 4. Chaque étape de l'agent part directement vers le navigateur
        const result = await runAccountAnalyst(databricks, customerId, (step) =>
          send("step", step)
        );

        send("report", result);
        console.log(
          `Account Analyst finished for ${customerId}: ${result.steps} steps, ${result.totalTokens} tokens`
        );
      } catch (error) {
        console.error("Account Analyst error:", error);
        send("error", { message: "The investigation failed. Please try again." });
      } finally {
        // 5. Toujours terminer proprement
        send("done", {});
        if (!closed) res.end();
      }
    }
  );

  return router;
}