import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SaaS Revenue Intelligence API",
  });
});

export default router;