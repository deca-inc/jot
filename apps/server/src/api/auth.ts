import { Router } from "express";
import { z } from "zod";
import { AuthService, AuthError } from "../auth/authService.js";
import { AuditLogRepository } from "../db/repositories/auditLog.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";

// Request validation schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Optional UEK data for E2EE
  uek: z.object({
    wrappedUek: z.string(),
    salt: z.string(),
    nonce: z.string(),
    authTag: z.string(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Create auth router with all authentication endpoints
 */
export function createAuthRouter(authService: AuthService, auditLog?: AuditLogRepository): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // Helper to get IP address
  const getIp = (req: { ip?: string; socket: { remoteAddress?: string } }) =>
    req.ip ?? req.socket.remoteAddress ?? "unknown";

  /**
   * POST /api/auth/register
   * Register a new user
   */
  router.post("/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.errors[0].message,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      const { email, password, uek } = parsed.data;
      const result = await authService.register(email, password, uek);

      // Audit log
      auditLog?.log(result.user.id, "register", "user", result.user.id, getIp(req), { email });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof AuthError) {
        const status = error.code === "EMAIL_EXISTS" ? 409 : 400;
        res.status(status).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  router.post("/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.errors[0].message,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      const { email, password } = parsed.data;
      const result = await authService.login(email, password);

      // Audit log
      auditLog?.log(result.user.id, "login", "user", result.user.id, getIp(req), { email });

      res.json(result);
    } catch (error) {
      if (error instanceof AuthError) {
        // Audit log failed login
        auditLog?.log("anonymous", "login_failed", "auth", undefined, getIp(req), {
          email: loginSchema.safeParse(req.body).data?.email,
          errorCode: error.code,
        });
        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Get a new access token using refresh token
   */
  router.post("/refresh", async (req, res) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.errors[0].message,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      const { refreshToken } = parsed.data;
      const result = await authService.refresh(refreshToken);

      // Note: We don't log token refresh since it's not security-critical
      // and would require parsing the token to get user ID

      res.json(result);
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Invalidate refresh token
   */
  router.post("/logout", (req, res) => {
    try {
      const parsed = logoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.errors[0].message,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      const { refreshToken } = parsed.data;
      authService.logout(refreshToken);

      // Audit log (we don't have user ID here, but could parse the refresh token if needed)
      auditLog?.log("anonymous", "logout", undefined, undefined, getIp(req));

      res.json({ success: true });
    } catch {
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user info (requires authentication)
   */
  router.get("/me", authMiddleware, (req, res) => {
    if (!req.user) {
      res.status(401).json({
        error: "Not authenticated",
        code: "NOT_AUTHENTICATED",
      });
      return;
    }

    const user = authService.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  });

  /**
   * POST /api/auth/logout-all
   * Invalidate all refresh tokens for current user (requires authentication)
   */
  router.post("/logout-all", authMiddleware, (req, res) => {
    if (!req.user) {
      res.status(401).json({
        error: "Not authenticated",
        code: "NOT_AUTHENTICATED",
      });
      return;
    }

    const count = authService.logoutAll(req.user.userId);

    // Audit log
    auditLog?.log(req.user.userId, "logout_all", "user", req.user.userId, getIp(req), {
      sessionsInvalidated: count,
    });

    res.json({ success: true, sessionsInvalidated: count });
  });

  return router;
}
