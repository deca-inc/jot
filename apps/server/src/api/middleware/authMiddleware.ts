import { AuthService, AuthError, type TokenPayload } from "../../auth/authService.js";
import type { Request, Response, NextFunction } from "express";

// Extend Express Request to include user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation requires namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Create auth middleware that validates access tokens
 */
export function createAuthMiddleware(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Missing or invalid authorization header",
        code: "MISSING_TOKEN",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    try {
      const payload = authService.verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      res.status(401).json({
        error: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }
  };
}

/**
 * Optional auth middleware - doesn't require auth but attaches user if present
 */
export function createOptionalAuthMiddleware(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const payload = authService.verifyAccessToken(token);
        req.user = payload;
      } catch {
        // Invalid token - continue without user
      }
    }

    next();
  };
}
