type Environment = Record<string, unknown>;

function stringValue(
  value: unknown,
) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function requireValue(
  environment: Environment,
  name: string,
) {
  const value =
    stringValue(
      environment[name],
    );

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  environment[name] =
    value;

  return value;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  name: string,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return fallback;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }

  return parsed;
}

function validateRedisUrl(
  value: string,
) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'REDIS_URL must be a valid URL.',
    );
  }

  if (
    url.protocol !== 'redis:' &&
    url.protocol !== 'rediss:'
  ) {
    throw new Error(
      'REDIS_URL must use redis:// or rediss://.',
    );
  }
}

export function validateEnvironment(
  input: Environment,
) {
  const environment: Environment = {
    ...input,
  };

  const nodeEnv =
    stringValue(
      environment.NODE_ENV,
    ) ||
    'development';

  environment.NODE_ENV =
    nodeEnv;

  requireValue(
    environment,
    'DATABASE_URL',
  );

  requireValue(
    environment,
    'SHOPIFY_API_KEY',
  );

  requireValue(
    environment,
    'SHOPIFY_API_SECRET',
  );

  const redisUrl =
    stringValue(
      environment.REDIS_URL,
    ) ||
    'redis://127.0.0.1:6380';

  validateRedisUrl(
    redisUrl,
  );

  environment.REDIS_URL =
    redisUrl;

  environment.PORT =
    positiveInteger(
      environment.PORT,
      3001,
      'PORT',
    );

  environment.HEALTHCHECK_TIMEOUT_MS =
    positiveInteger(
      environment.HEALTHCHECK_TIMEOUT_MS,
      2500,
      'HEALTHCHECK_TIMEOUT_MS',
    );

  environment.TRANSLATION_QUEUE_CONCURRENCY =
    positiveInteger(
      environment.TRANSLATION_QUEUE_CONCURRENCY,
      2,
      'TRANSLATION_QUEUE_CONCURRENCY',
    );

  environment.TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY =
    positiveInteger(
      environment.TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY,
      1,
      'TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY',
    );

  environment.TRANSLATION_QUEUE_ATTEMPTS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_ATTEMPTS,
      5,
      'TRANSLATION_QUEUE_ATTEMPTS',
    );

  environment.TRANSLATION_QUEUE_REVIEW_ATTEMPTS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_REVIEW_ATTEMPTS,
      5,
      'TRANSLATION_QUEUE_REVIEW_ATTEMPTS',
    );

  environment.TRANSLATION_QUEUE_PUBLISH_ATTEMPTS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_PUBLISH_ATTEMPTS,
      8,
      'TRANSLATION_QUEUE_PUBLISH_ATTEMPTS',
    );

  environment.TRANSLATION_QUEUE_BACKOFF_MS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_BACKOFF_MS,
      10000,
      'TRANSLATION_QUEUE_BACKOFF_MS',
    );

  environment.TRANSLATION_QUEUE_RATE_LIMIT_MAX =
    positiveInteger(
      environment.TRANSLATION_QUEUE_RATE_LIMIT_MAX,
      10,
      'TRANSLATION_QUEUE_RATE_LIMIT_MAX',
    );

  environment.TRANSLATION_QUEUE_RATE_LIMIT_DURATION_MS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_RATE_LIMIT_DURATION_MS,
      1000,
      'TRANSLATION_QUEUE_RATE_LIMIT_DURATION_MS',
    );

  environment.TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS,
      60000,
      'TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS',
    );

  environment.TRANSLATION_QUEUE_STALE_RUNNING_MS =
    positiveInteger(
      environment.TRANSLATION_QUEUE_STALE_RUNNING_MS,
      300000,
      'TRANSLATION_QUEUE_STALE_RUNNING_MS',
    );

  environment.TRANSLATION_QUEUE_RECOVERY_BATCH_SIZE =
    positiveInteger(
      environment.TRANSLATION_QUEUE_RECOVERY_BATCH_SIZE,
      100,
      'TRANSLATION_QUEUE_RECOVERY_BATCH_SIZE',
    );

  const apiPrefix =
    stringValue(
      environment.API_PREFIX,
    ) ||
    'api/v1';

  environment.API_PREFIX =
    apiPrefix.replace(
      /^\/+|\/+$/g,
      '',
    );

  const internalSecret =
    stringValue(
      environment.ACA_LOCALE_INTERNAL_SECRET,
    );

  if (
    internalSecret &&
    internalSecret.length < 32
  ) {
    throw new Error(
      'ACA_LOCALE_INTERNAL_SECRET must contain at least 32 characters.',
    );
  }

  if (
    nodeEnv === 'production'
  ) {
    if (!internalSecret) {
      throw new Error(
        'ACA_LOCALE_INTERNAL_SECRET is required in production.',
      );
    }

    if (
      !stringValue(
        environment.CORS_ORIGINS,
      )
    ) {
      throw new Error(
        'CORS_ORIGINS is required in production.',
      );
    }
  }

  if (internalSecret) {
    environment.ACA_LOCALE_INTERNAL_SECRET =
      internalSecret;
  }

  return environment;
}
