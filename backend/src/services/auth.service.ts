import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { JwtPayload, AuthenticatedUser, AuditAction } from '../types/index.js';
import { auditService } from './audit.service.js';

const SALT_ROUNDS = 12;

export interface LoginResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  /**
   * Authenticate user with email and password
   */
  async login(
    email: string,
    password: string,
    generateToken: (payload: JwtPayload) => string,
    ipAddress?: string,
    userAgent?: string,
    deviceId?: string
  ): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = await this.createRefreshToken(user.id, deviceId);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      description: `User ${user.email} logged in`,
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  },

  /**
   * Create a refresh token for a user
   */
  async createRefreshToken(userId: string, deviceId?: string): Promise<string> {
    const token = nanoid(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiry);

    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        deviceId,
        expiresAt,
      },
    });

    return token;
  },

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    generateToken: (payload: JwtPayload) => string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    if (!tokenRecord.user.isActive) {
      throw new Error('User account is disabled');
    }

    // Rotate refresh token
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = await this.createRefreshToken(
      tokenRecord.userId,
      tokenRecord.deviceId || undefined
    );

    const accessToken = generateToken({
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  },

  /**
   * Revoke a refresh token (logout)
   */
  async revokeRefreshToken(
    refreshToken: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (tokenRecord && tokenRecord.userId === userId) {
      await prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });

      await auditService.log({
        userId,
        userEmail: tokenRecord.user.email,
        action: AuditAction.LOGOUT,
        entityType: 'user',
        entityId: userId,
        description: `User ${tokenRecord.user.email} logged out`,
        ipAddress,
        userAgent,
      });
    }
  },

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<AuthenticatedUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  },

  /**
   * Cleanup expired refresh tokens (run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
    return result.count;
  },
};
