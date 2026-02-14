import { PrismaClient } from '@prisma/client';
import { config } from './index.js';

export const prisma = new PrismaClient({
  log: config.isDev ? ['query', 'info', 'warn', 'error'] : ['error'],
});
