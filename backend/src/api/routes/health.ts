import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { s3Client } from '../../config/s3.js';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health - Health check
  fastify.get('/', async () => {
    const checks: Record<string, 'healthy' | 'unhealthy' | 'degraded'> = {};

    // Database check
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'healthy';
    } catch {
      checks.database = 'unhealthy';
    }

    // Redis check
    try {
      await redis.ping();
      checks.redis = 'healthy';
    } catch {
      checks.redis = 'unhealthy';
    }

    // S3 check
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: config.aws.s3Bucket }));
      checks.s3 = 'healthy';
    } catch {
      checks.s3 = 'unhealthy';
    }

    // Overall status
    const allHealthy = Object.values(checks).every((s) => s === 'healthy');
    const anyUnhealthy = Object.values(checks).some((s) => s === 'unhealthy');

    return {
      status: allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      services: checks,
    };
  });

  // GET /health/live - Liveness probe (for Kubernetes)
  fastify.get('/live', async () => {
    return { status: 'ok' };
  });

  // GET /health/ready - Readiness probe (for Kubernetes)
  fastify.get('/ready', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'not ready' });
    }
  });
};
