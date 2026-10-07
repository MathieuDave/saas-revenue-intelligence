import { Router } from "express";

import {
  getState,
  getSignals,
  subscribe,
  play,
  pause,
  reset,
  seek,
} from "../simulation.js";

export function createLiveRouter() {
  const router = Router();

  // =========================================================
  // FLUX EN DIRECT (Server-Sent Events)
  // GET /api/live → chaque onglet connecté devient un abonné
  // =========================================================

  router.get("/live", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Envoyer un message SSE à CE client
    function send(eventName: string, data: unknown) {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    // 1. Dès la connexion : envoyer l'état actuel de l'horloge
    send("state", getState());
    // Et les situations du mois actuel
    const { month } = getState();
    if (month) {
      getSignals(month)
        .then((result) => send("signals", result))
        .catch((error) => console.error("Live initial signals error:", error));
    }

    // 2. S'abonner : l'horloge appellera send() à chaque changement
    const unsubscribe = subscribe(send);

    // 3. Battement de cœur toutes les 25 s pour garder la connexion ouverte
    //    (les lignes qui commencent par « : » sont ignorées par le navigateur)
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 25_000);

    console.log("Live client connected");

    // 4. Nettoyage quand le client part
    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
      console.log("Live client disconnected");
    });
  });

  // =========================================================
  // PILOTER L'HORLOGE
  // GET = lire · POST = changer l'état
  // =========================================================

  router.get("/simulation", (_req, res) => {
    res.json(getState());
  });

  router.post("/simulation/play", (_req, res) => {
    play();
    res.json(getState());
  });

  router.post("/simulation/pause", (_req, res) => {
    pause();
    res.json(getState());
  });

  router.post("/simulation/reset", (_req, res) => {
    reset();
    res.json(getState());
  });

  // Aller à un mois précis. Corps attendu : { "month": "2026-03" }
  router.post("/simulation/seek", (req, res) => {
    const month = String(req.body?.month ?? "");

    if (!seek(month)) {
      res.status(400).json({
        error: `Unknown month '${month}'. Expected a month between the first and last available months (YYYY-MM).`,
      });
      return;
    }

    res.json(getState());
  });

  return router;
}