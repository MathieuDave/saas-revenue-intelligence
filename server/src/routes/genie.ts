import { Router } from "express";
import { askGenie } from "../genie.js";

const router = Router();

    // =========================================================
    // START EXPRESS
    // =========================================================
router.post("/genie/chat", async (req, res) => {
  try {
    const { question, conversationId } = req.body as {
  question?: string;
  conversationId?: string;
};

    if (!question?.trim()) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    const result = await askGenie(
  question.trim(),
  conversationId
);

    return res.json(result);
  } catch (error) {
    console.error("Genie error:", error);

    return res.status(500).json({
      error: "Unable to get a response from Genie",
    });
  }
});

export default router;