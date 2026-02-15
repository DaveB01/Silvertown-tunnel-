import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // Environment
  env: optionalEnv('NODE_ENV', 'development'),
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: optionalEnv('NODE_ENV', 'development') === 'production',

  // Server
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  apiUrl: optionalEnv('API_URL', 'http://localhost:3000'),
  webUrl: optionalEnv('WEB_URL', 'http://localhost:3001'),
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3001,https://silvertown-tunnel-zpzj.vercel.app').split(','),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Redis
  redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiry: optionalEnv('JWT_EXPIRY', '15m'),
  refreshTokenExpiry: parseInt(optionalEnv('REFRESH_TOKEN_EXPIRY_DAYS', '7'), 10),

  // AWS S3 (optional - for media uploads)
  aws: {
    region: optionalEnv('AWS_REGION', 'eu-west-2'),
    accessKeyId: optionalEnv('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optionalEnv('AWS_SECRET_ACCESS_KEY', ''),
    s3Bucket: optionalEnv('AWS_S3_BUCKET', ''),
    cloudfrontUrl: optionalEnv('CLOUDFRONT_URL', ''),
  },

  // SendGrid (optional - for email)
  sendgrid: {
    apiKey: optionalEnv('SENDGRID_API_KEY', ''),
    fromEmail: optionalEnv('SENDGRID_FROM_EMAIL', 'noreply@infratec.co.uk'),
    fromName: optionalEnv('SENDGRID_FROM_NAME', 'INFRATEC Inspections'),
  },

  // Media limits
  media: {
    maxPhotoSize: parseInt(optionalEnv('MAX_PHOTO_SIZE_MB', '20'), 10) * 1024 * 1024,
    maxVideoSize: parseInt(optionalEnv('MAX_VIDEO_SIZE_MB', '500'), 10) * 1024 * 1024,
    maxVideoDuration: parseInt(optionalEnv('MAX_VIDEO_DURATION_SEC', '300'), 10),
    presignedUrlExpiry: parseInt(optionalEnv('PRESIGNED_URL_EXPIRY_SEC', '300'), 10),
    downloadUrlExpiry: parseInt(optionalEnv('DOWNLOAD_URL_EXPIRY_SEC', '3600'), 10),
  },

  // Branding defaults (can be overridden in database)
  branding: {
    companyName: 'INFRATEC',
    primaryColor: '#003366',
    secondaryColor: '#FF6600',
    logoUrl: '/assets/infratec-logo.png',
  },
} as const;

export type Config = typeof config;
