import * as argon2 from "argon2";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { RefreshTokenRepository } from "../db/repositories/refreshTokens.js";
import { UserRepository, type User, type UEKData } from "../db/repositories/users.js";
import type { StringValue } from "ms";

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
  uek?: UEKData;
}

export interface UEKInput {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
}

export interface AuthServiceConfig {
  jwtSecret: string;
  accessTokenExpiresIn?: StringValue; // e.g., "15m"
  refreshTokenExpiresInMs?: number; // e.g., 90 * 24 * 60 * 60 * 1000 (90 days)
}

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN: StringValue = "15m";
const DEFAULT_REFRESH_TOKEN_EXPIRES_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Service for authentication operations
 */
export class AuthService {
  private userRepo: UserRepository;
  private refreshTokenRepo: RefreshTokenRepository;
  private config: Required<AuthServiceConfig>;

  constructor(db: Database.Database, config: AuthServiceConfig) {
    this.userRepo = new UserRepository(db);
    this.refreshTokenRepo = new RefreshTokenRepository(db);
    this.config = {
      jwtSecret: config.jwtSecret,
      accessTokenExpiresIn: config.accessTokenExpiresIn || DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresInMs: config.refreshTokenExpiresInMs || DEFAULT_REFRESH_TOKEN_EXPIRES_MS,
    };
  }

  /**
   * Register a new user
   * @param email - User's email
   * @param password - User's password
   * @param uekData - Optional UEK data for E2EE
   */
  async register(email: string, password: string, uekData?: UEKInput): Promise<AuthResult> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new AuthError("Invalid email format", "INVALID_EMAIL");
    }

    // Validate password strength
    if (password.length < 8) {
      throw new AuthError("Password must be at least 8 characters", "WEAK_PASSWORD");
    }

    // Check if email already exists
    if (this.userRepo.emailExists(email)) {
      throw new AuthError("Email already registered", "EMAIL_EXISTS");
    }

    // Hash password
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = this.userRepo.create(email, passwordHash);

    // Store UEK if provided
    if (uekData) {
      this.userRepo.setUEK(
        user.id,
        uekData.wrappedUek,
        uekData.salt,
        uekData.nonce,
        uekData.authTag,
      );
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Get UEK data to return (version will be set after setUEK)
    const uek = this.userRepo.getUEK(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      ...tokens,
      ...(uek && { uek }),
    };
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthResult> {
    // Find user
    const user = this.userRepo.getByEmail(email);
    if (!user) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Verify password
    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Get UEK data if exists
    const uek = this.userRepo.getUEK(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      ...tokens,
      ...(uek && { uek }),
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    // Verify refresh token
    const tokenRecord = this.refreshTokenRepo.verify(refreshToken);
    if (!tokenRecord) {
      throw new AuthError("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
    }

    // Get user
    const user = this.userRepo.getById(tokenRecord.userId);
    if (!user) {
      throw new AuthError("User not found", "USER_NOT_FOUND");
    }

    // Generate new access token
    const accessToken = this.generateAccessToken(user);

    return { accessToken };
  }

  /**
   * Logout - invalidate refresh token
   */
  logout(refreshToken: string): boolean {
    return this.refreshTokenRepo.deleteByToken(refreshToken);
  }

  /**
   * Logout all devices - invalidate all refresh tokens for user
   */
  logoutAll(userId: string): number {
    return this.refreshTokenRepo.deleteAllForUser(userId);
  }

  /**
   * Verify an access token and return the payload
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as TokenPayload;
      return payload;
    } catch {
      throw new AuthError("Invalid or expired access token", "INVALID_ACCESS_TOKEN");
    }
  }

  /**
   * Get user by ID
   */
  getUserById(userId: string): User | null {
    return this.userRepo.getById(userId);
  }

  /**
   * Clean up expired refresh tokens
   */
  cleanupExpiredTokens(): number {
    return this.refreshTokenRepo.deleteExpired();
  }

  private generateTokens(user: User): AuthTokens {
    const accessToken = this.generateAccessToken(user);
    const { token: refreshToken } = this.refreshTokenRepo.create(
      user.id,
      this.config.refreshTokenExpiresInMs,
    );

    return { accessToken, refreshToken };
  }

  private generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
    };

    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.accessTokenExpiresIn,
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
