import { Router } from "express";

export interface ChatRequest {
  message: string;
  model?: string;
  context?: string[];
}

export interface ChatResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export function createChatRouter(): Router {
  const router = Router();

  // POST /api/chat - Generate a response (stub)
  router.post("/", (req, res) => {
    const body = req.body as ChatRequest;

    if (!body.message) {
      res.status(400).json({
        ok: false,
        error: "Message is required",
      });
      return;
    }

    // Stub response - LLM not configured
    const response: ChatResponse = {
      ok: false,
      error: "LLM not configured. Please download a model using `jot-server models download`.",
    };

    res.status(503).json(response);
  });

  return router;
}
