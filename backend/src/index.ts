import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { join } from 'path';

import { config } from './config/index.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';

// Routes
import { authRoutes } from './api/routes/auth.js';
import { userRoutes } from './api/routes/users.js';
import { assetRoutes } from './api/routes/assets.js';
import { inspectionRoutes } from './api/routes/inspections.js';
import { mediaRoutes } from './api/routes/media.js';
import { reportRoutes } from './api/routes/reports.js';
import { syncRoutes } from './api/routes/sync.js';
import { settingsRoutes } from './api/routes/settings.js';
import { healthRoutes } from './api/routes/health.js';
import { importRoutes } from './api/routes/import.js';

// Plugins
import { authPlugin } from './api/plugins/auth.js';
import { errorPlugin } from './api/plugins/error.js';

const app = Fastify({
  logger: {
    level: config.logLevel,
    transport: config.isDev
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
  },
});

async function bootstrap() {
  // Security
  await app.register(helmet, {
    contentSecurityPolicy: config.isProd,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded from frontend
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiry },
  });

  // File uploads
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB for videos
    },
  });

  // Static file serving for uploaded media (local development only)
  if (!config.isProd) {
    try {
      await app.register(fastifyStatic, {
        root: join(__dirname, '..', 'uploads'),
        prefix: '/uploads/',
        decorateReply: false,
      });
    } catch (e) {
      app.log.warn('Static file serving not available');
    }
  }

  // Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Silvertown Tunnel Inspection API',
        description: 'Asset inspection management system',
        version: '1.0.0',
      },
      servers: [{ url: config.apiUrl }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Custom plugins
  await app.register(authPlugin);
  await app.register(errorPlugin);

  // API Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(userRoutes, { prefix: '/v1/users' });
  await app.register(assetRoutes, { prefix: '/v1/assets' });
  await app.register(inspectionRoutes, { prefix: '/v1/inspections' });
  await app.register(mediaRoutes, { prefix: '/v1/media' });
  await app.register(reportRoutes, { prefix: '/v1/reports' });
  await app.register(syncRoutes, { prefix: '/v1/sync' });
  await app.register(settingsRoutes, { prefix: '/v1/settings' });
  await app.register(importRoutes, { prefix: '/v1/import' });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Server running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
