export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:8080',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY, // 32-byte hex
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    currency: process.env.STRIPE_CURRENCY ?? 'EUR',
  },

  daily: {
    apiKey: process.env.DAILY_API_KEY,
    apiUrl: process.env.DAILY_API_URL ?? 'https://api.daily.co/v1',
  },

  email: {
    sendgridKey: process.env.SENDGRID_API_KEY,
    from: process.env.EMAIL_FROM ?? 'noreply@nafsolea.com',
    fromName: process.env.EMAIL_FROM_NAME ?? 'Nafsoléa',
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION ?? 'eu-west-3',
    s3Bucket: process.env.AWS_S3_BUCKET ?? 'nafsolea-uploads',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
