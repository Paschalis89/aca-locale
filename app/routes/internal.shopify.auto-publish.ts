import {
  timingSafeEqual,
} from 'node:crypto';

import type {
  ActionFunctionArgs,
} from 'react-router';

import {
  unauthenticated,
} from '../shopify.server';

type AutoPublishPayload = {
  shopifyDomain?: unknown;
  resourceId?: unknown;
  resourceType?: unknown;
  key?: unknown;
  sourceLocale?: unknown;
  targetLocale?: unknown;
  sourceDigest?: unknown;
  value?: unknown;
};

function secureEqual(
  left:
    string,
  right:
    string,
) {
  const leftBuffer =
    Buffer.from(
      left,
    );

  const rightBuffer =
    Buffer.from(
      right,
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

function requiredString(
  value:
    unknown,
  name:
    string,
) {
  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value.trim();
}

function validShopDomain(
  value:
    string,
) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(
    value,
  );
}

export async function action({
  request,
}: ActionFunctionArgs) {
  if (
    request.method.toUpperCase() !==
    'POST'
  ) {
    return Response.json(
      {
        message:
          'Method not allowed.',
      },
      {
        status:
          405,
      },
    );
  }

  const configuredSecret =
    process.env.ACA_LOCALE_INTERNAL_SECRET?.trim();

  const suppliedSecret =
    request.headers
      .get(
        'X-ACA-Locale-Internal-Secret',
      )
      ?.trim();

  // Fetch Headers may coalesce duplicate header values with a comma.
  // Refuse ambiguous credentials instead of accepting whichever comes first.
  if (
    !configuredSecret ||
    configuredSecret.includes(',') ||
    !suppliedSecret ||
    suppliedSecret.includes(',') ||
    !secureEqual(
      configuredSecret,
      suppliedSecret,
    )
  ) {
    return Response.json(
      {
        message:
          'Unauthorized.',
      },
      {
        status:
          401,
      },
    );
  }

  let payload:
    AutoPublishPayload;

  try {
    payload =
      await request.json() as
        AutoPublishPayload;
  } catch {
    return Response.json(
      {
        message:
          'Invalid JSON payload.',
      },
      {
        status:
          400,
      },
    );
  }

  try {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return Response.json(
        { message: 'Invalid publication payload.' },
        { status: 400 },
      );
    }

    const shopifyDomain =
      requiredString(
        payload.shopifyDomain,
        'shopifyDomain',
      ).toLowerCase();

    const resourceId =
      requiredString(
        payload.resourceId,
        'resourceId',
      );

    const fieldKey =
      requiredString(
        payload.key,
        'key',
      );

    const targetLocale =
      requiredString(
        payload.targetLocale,
        'targetLocale',
      );

    const sourceDigest =
      requiredString(
        payload.sourceDigest,
        'sourceDigest',
      );

    const value =
      requiredString(
        payload.value,
        'value',
      );

    if (
      !validShopDomain(
        shopifyDomain,
      )
    ) {
      return Response.json(
        {
          message:
            'Invalid Shopify domain.',
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !resourceId.startsWith(
        'gid://shopify/',
      )
    ) {
      return Response.json(
        {
          message:
            'Invalid Shopify resource ID.',
        },
        {
          status:
            400,
        },
      );
    }

    /*
     * This is a server-to-server background task. The shop domain came from
     * ACA Locale's authenticated NestJS worker, not from browser input.
     * unauthenticated.admin() therefore reuses the stored OFFLINE Shopify
     * session without copying Admin API credentials into the NestJS DB.
     */
    const {
      admin,
    } =
      await unauthenticated.admin(
        shopifyDomain,
      );

    const currentResponse =
      await admin.graphql(
        `#graphql
          query AcaLocaleAutomaticPublishResource(
            $resourceId: ID!
            $targetLocale: String!
          ) {
            translatableResource(
              resourceId: $resourceId
            ) {
              resourceId

              translatableContent {
                key
                value
                locale
                digest
              }

              translations(
                locale: $targetLocale
              ) {
                key
                locale
                value
                outdated
                updatedAt
                market {
                  id
                }
              }
            }
          }
        `,
        {
          variables: {
            resourceId,
            targetLocale,
          },
        },
      );

    const currentJson =
      (await currentResponse.json()) as
        Awaited<ReturnType<typeof currentResponse.json>> & { errors?: unknown };

    if (
      currentJson.errors
    ) {
      console.error(
        '[ACA Locale] Automatic publish translatableResource failed:',
        currentJson.errors,
      );

      return Response.json(
        {
          message:
            'Unable to read current Shopify translation source.',
          errors:
            currentJson.errors,
        },
        {
          status:
            502,
        },
      );
    }

    const resource =
      currentJson.data
        ?.translatableResource;

    if (
      resource &&
      resource.resourceId !== resourceId
    ) {
      return Response.json(
        { message: 'Shopify resource identity mismatch.', code: 'RESOURCE_ID_MISMATCH' },
        { status: 409 },
      );
    }

    if (!resource) {
      return Response.json(
        {
          message:
            'Shopify translatable resource was not found.',
          code:
            'RESOURCE_NOT_FOUND',
        },
        {
          status:
            409,
        },
      );
    }

    const content =
      resource.translatableContent
        ?.find(
          (
            candidate:
              any,
          ) =>
            candidate.key ===
            fieldKey,
        );

    if (!content) {
      return Response.json(
        {
          message:
            `Shopify translatable content "${fieldKey}" was not found.`,
          code:
            'FIELD_NOT_FOUND',
        },
        {
          status:
            409,
        },
      );
    }

    if (
      !content.digest ||
      content.digest !==
        sourceDigest
    ) {
      return Response.json(
        {
          message:
            'The Shopify source content changed before automatic publication.',
          code:
            'SOURCE_DIGEST_MISMATCH',
          storedDigest:
            sourceDigest,
          currentDigest:
            content.digest ??
            null,
          currentSourceValue:
            content.value ??
            null,
        },
        {
          status:
            409,
        },
      );
    }

    /*
     * Idempotency for the narrow failure window where Shopify accepted the
     * previous mutation but ACA Locale did not confirm it locally.
     */
    const existingTranslation =
      resource.translations
        ?.find(
          (
            candidate:
              any,
          ) =>
            candidate.key ===
              fieldKey &&
            candidate.locale ===
              targetLocale &&
            !candidate.market?.id &&
            candidate.value ===
              value &&
            candidate.outdated !==
              true,
        );

    if (
      existingTranslation
    ) {
      return Response.json({
        published:
          true,
        alreadyPublished:
          true,
        translation:
          existingTranslation,
      });
    }

    const registerResponse =
      await admin.graphql(
        `#graphql
          mutation AcaLocaleAutomaticRegisterTranslation(
            $resourceId: ID!
            $translations: [TranslationInput!]!
          ) {
            translationsRegister(
              resourceId: $resourceId
              translations: $translations
            ) {
              translations {
                key
                locale
                value
                outdated
                updatedAt
              }

              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            resourceId,
            translations: [
              {
                locale:
                  targetLocale,
                key:
                  fieldKey,
                value,
                translatableContentDigest:
                  content.digest,
              },
            ],
          },
        },
      );

    const registerJson =
      (await registerResponse.json()) as
        Awaited<ReturnType<typeof registerResponse.json>> & { errors?: unknown };

    if (
      registerJson.errors
    ) {
      console.error(
        '[ACA Locale] Automatic translationsRegister failed:',
        registerJson.errors,
      );

      return Response.json(
        {
          message:
            'Shopify automatic translation publication failed.',
          errors:
            registerJson.errors,
        },
        {
          status:
            502,
        },
      );
    }

    const publication =
      registerJson.data
        ?.translationsRegister;

    if (!publication || !Array.isArray(publication.translations)) {
      return Response.json(
        { message: 'Shopify did not confirm the translation mutation result.' },
        { status: 502 },
      );
    }

    const userErrors =
      publication?.userErrors ??
      [];

    if (
      userErrors.length >
      0
    ) {
      return Response.json(
        {
          message:
            'Shopify rejected the automatic translation publication.',
          code:
            'SHOPIFY_USER_ERROR',
          userErrors,
        },
        {
          status:
            422,
        },
      );
    }

    return Response.json({
      published:
        true,
      alreadyPublished:
        false,
      shopify:
        publication,
    });
  } catch (error) {
    console.error(
      '[ACA Locale] Automatic translation publication gateway failed:',
      error,
    );

    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Automatic publication failed.',
      },
      {
        status:
          502,
      },
    );
  }
}
