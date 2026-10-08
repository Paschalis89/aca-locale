import type {
  ActionFunctionArgs,
} from 'react-router';

import {
  authenticate,
} from '../shopify.server';

import {
  callInternalBackendJson,
} from '../services/internal-backend.server';

import {
  syncMetaobjectWebhookSubscriptions,
} from '../services/metaobject-webhooks.server';

type ChangeAction =
  | 'UPSERT'
  | 'DELETE';

type TopicConfiguration = {
  resourceType: string;
  gidType: string;
  idVariable?: string;
};

type ClaimResponse = {
  eventId: string;
  process: boolean;
  duplicate?: boolean;
  retry?: boolean;
  status?: string;
  targetLocales: string[];
};

type ShopifyTranslation = {
  key: string;
  locale: string;
  value: string;
  outdated: boolean;
  updatedAt?: string | null;
  market?: {
    id?: string;
  } | null;
};

type ShopifyTranslatableContent = {
  key: string;
  type: string;
  locale: string;
  value: string;
  digest: string;
};

/*
 * Shop-scoped Metaobject webhooks are created dynamically
 * for the translatable MetaobjectDefinition types discovered
 * on each merchant shop.
 *
 * Product / Collection / Page / Blog / Article use Shopify
 * Events in shopify.app.toml.
 */
const WEBHOOK_TOPICS:
  Record<
    string,
    TopicConfiguration & {
      action: ChangeAction;
    }
  > = {
    METAOBJECTS_CREATE: {
      resourceType:
        'METAOBJECT',
      gidType:
        'Metaobject',
      action:
        'UPSERT',
    },

    METAOBJECTS_UPDATE: {
      resourceType:
        'METAOBJECT',
      gidType:
        'Metaobject',
      action:
        'UPSERT',
    },

    METAOBJECTS_DELETE: {
      resourceType:
        'METAOBJECT',
      gidType:
        'Metaobject',
      action:
        'DELETE',
    },

    /*
     * Compatibility with any old app-specific
     * subscriptions that might still exist while
     * switching Product / Collection to Events.
     */
    PRODUCTS_CREATE: {
      resourceType:
        'PRODUCT',
      gidType:
        'Product',
      action:
        'UPSERT',
    },

    PRODUCTS_UPDATE: {
      resourceType:
        'PRODUCT',
      gidType:
        'Product',
      action:
        'UPSERT',
    },

    PRODUCTS_DELETE: {
      resourceType:
        'PRODUCT',
      gidType:
        'Product',
      action:
        'DELETE',
    },

    COLLECTIONS_CREATE: {
      resourceType:
        'COLLECTION',
      gidType:
        'Collection',
      action:
        'UPSERT',
    },

    COLLECTIONS_UPDATE: {
      resourceType:
        'COLLECTION',
      gidType:
        'Collection',
      action:
        'UPSERT',
    },

    COLLECTIONS_DELETE: {
      resourceType:
        'COLLECTION',
      gidType:
        'Collection',
      action:
        'DELETE',
    },
  };

const EVENT_TOPICS:
  Record<
    string,
    TopicConfiguration
  > = {
    PRODUCT: {
      resourceType:
        'PRODUCT',
      gidType:
        'Product',
      idVariable:
        'productId',
    },

    COLLECTION: {
      resourceType:
        'COLLECTION',
      gidType:
        'Collection',
      idVariable:
        'collectionId',
    },

    PAGE: {
      resourceType:
        'PAGE',
      gidType:
        'Page',
      idVariable:
        'pageId',
    },

    BLOG: {
      resourceType:
        'BLOG',
      gidType:
        'Blog',
      idVariable:
        'blogId',
    },

    ARTICLE: {
      resourceType:
        'ARTICLE',
      gidType:
        'Article',
      idVariable:
        'articleId',
    },
  };

function errorMessage(
  error:
    unknown,
) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function normalizeEventAction(
  value:
    unknown,
): ChangeAction {
  return String(
    value ?? '',
  ).toLowerCase() ===
    'delete'
    ? 'DELETE'
    : 'UPSERT';
}

function resolveShopifyResourceId(
  payload:
    Record<string, any>,

  configuration:
    TopicConfiguration,

  eventTopic?:
    string,
) {
  if (
    configuration.idVariable
  ) {
    const variableId =
      payload.query_variables?.[
        configuration.idVariable
      ];

    if (
      typeof variableId ===
        'string' &&
      variableId.startsWith(
        'gid://shopify/',
      )
    ) {
      return variableId;
    }
  }

  if (eventTopic) {
    const dataKey =
      eventTopic
        .charAt(0)
        .toLowerCase() +
      eventTopic.slice(1);

    const eventDataId =
      payload.data?.[
        dataKey
      ]?.id;

    if (
      typeof eventDataId ===
        'string' &&
      eventDataId.startsWith(
        'gid://shopify/',
      )
    ) {
      return eventDataId;
    }
  }

  const direct =
    payload.admin_graphql_api_id ??
    payload.id;

  if (
    typeof direct ===
      'string' &&
    direct.startsWith(
      'gid://shopify/',
    )
  ) {
    return direct;
  }

  if (
    typeof direct ===
      'number' ||
    typeof direct ===
      'string'
  ) {
    const id =
      String(direct)
        .trim();

    if (id) {
      return `gid://shopify/${configuration.gidType}/${id}`;
    }
  }

  throw new Error(
    `Unable to resolve Shopify ${configuration.gidType} resource ID from change payload.`,
  );
}

async function fetchIncrementalResource(
  admin:
    any,

  resourceId:
    string,

  targetLocales:
    string[],
) {
  const localeDefinitions =
    targetLocales
      .map(
        (
          _locale,
          index,
        ) =>
          `$locale${index}: String!`,
      )
      .join(
        ', ',
      );

  const translationSelections =
    targetLocales
      .map(
        (
          _locale,
          index,
        ) => `
          translations${index}: translations(
            locale: $locale${index}
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
        `,
      )
      .join(
        '\n',
      );

  const variableDeclaration =
    localeDefinitions
      ? `, ${localeDefinitions}`
      : '';

  const query = `#graphql
    query AcaLocaleIncrementalTranslationResource(
      $resourceId: ID!${variableDeclaration}
    ) {
      translatableResource(
        resourceId: $resourceId
      ) {
        resourceId

        translatableContent {
          key
          type
          locale
          value
          digest
        }

        ${translationSelections}
      }
    }
  `;

  const variables:
    Record<
      string,
      string
    > = {
      resourceId,
    };

  targetLocales.forEach(
    (
      locale,
      index,
    ) => {
      variables[
        `locale${index}`
      ] = locale;
    },
  );

  const response =
    await admin.graphql(
      query,
      {
        variables,
      },
    );

  const json =
    await response.json();

  if (
    json.errors
  ) {
    throw new Error(
      `Shopify translatableResource failed: ${JSON.stringify(
        json.errors,
      )}`,
    );
  }

  const resource =
    json.data
      ?.translatableResource;

  if (!resource) {
    return null;
  }

  const content:
    ShopifyTranslatableContent[] =
      Array.isArray(
        resource.translatableContent,
      )
        ? resource.translatableContent
        : [];

  const locales =
    targetLocales.map(
      (
        targetLocale,
        index,
      ) => ({
        targetLocale,

        translations:
          (
            Array.isArray(
              resource[
                `translations${index}`
              ],
            )
              ? resource[
                  `translations${index}`
                ]
              : []
          ) as ShopifyTranslation[],
      }),
    );

  return {
    resourceId:
      resource.resourceId ??
      resourceId,

    content,
    locales,
  };
}

export const action =
  async ({
    request,
  }: ActionFunctionArgs) => {
    const webhook =
      await authenticate.webhook(
        request,
      );

    const rawTopic =
      String(
        webhook.topic,
      );

    const normalizedTopic =
      rawTopic.toUpperCase();

    const webhookAction =
      (
        webhook as {
          action?: unknown;
        }
      ).action;

    const isEvent =
      typeof webhookAction ===
        'string';

    /*
     * A MetaobjectDefinition change can add/remove a type or
     * change whether that type is translatable. Reconcile the
     * three shop-scoped METAOBJECTS_* subscriptions immediately
     * so ACA Locale keeps tracking every translatable type.
     */
    if (
      isEvent &&
      normalizedTopic ===
        'METAOBJECTDEFINITION'
    ) {
      if (!webhook.admin) {
        console.error(
          '[ACA Locale] MetaobjectDefinition event has no offline Admin API session.',
        );

        return new Response(
          null,
          {
            status: 500,
          },
        );
      }

      try {
        const result =
          await syncMetaobjectWebhookSubscriptions(
            webhook.admin,
          );

        console.info(
          '[ACA Locale] Metaobject webhook subscriptions reconciled after definition change:',
          result,
        );

        return new Response(
          null,
          {
            status: 200,
          },
        );
      } catch (error) {
        console.error(
          '[ACA Locale] Metaobject webhook subscription reconciliation failed:',
          error,
        );

        return new Response(
          null,
          {
            status: 500,
          },
        );
      }
    }

    const eventConfiguration =
      isEvent
        ? EVENT_TOPICS[
            normalizedTopic
          ]
        : undefined;

    const traditionalConfiguration =
      !isEvent
        ? WEBHOOK_TOPICS[
            normalizedTopic
          ]
        : undefined;

    const configuration =
      eventConfiguration ??
      traditionalConfiguration;

    if (!configuration) {
      console.warn(
        `[ACA Locale] Unsupported translation content change topic: ${rawTopic}`,
      );

      return new Response(
        null,
        {
          status:
            200,
        },
      );
    }

    const action:
      ChangeAction =
      isEvent
        ? normalizeEventAction(
            webhookAction,
          )
        : traditionalConfiguration!
            .action;

    const payload =
      webhook.payload as
        Record<string, any>;

    const shopifyResourceId =
      resolveShopifyResourceId(
        payload,
        configuration,
        isEvent
          ? rawTopic
          : undefined,
      );

    const triggeredAt =
      'triggeredAt' in webhook &&
      typeof (
        webhook as {
          triggeredAt?: unknown;
        }
      ).triggeredAt ===
        'string'
        ? (
            webhook as {
              triggeredAt:
                string;
            }
          ).triggeredAt
        : undefined;

    const auditTopic =
      isEvent
        ? `${normalizedTopic}_${String(
            webhookAction,
          ).toUpperCase()}`
        : normalizedTopic;

    let claim:
      ClaimResponse |
      null =
      null;

    try {
      claim =
        await callInternalBackendJson<ClaimResponse>(
          '/api/v1/internal/shopify/content-change/claim',
          {
            shopifyDomain:
              webhook.shop,

            webhookId:
              webhook.webhookId,

            topic:
              auditTopic,

            resourceType:
              configuration.resourceType,

            shopifyResourceId,

            action,

            triggeredAt,
          },
        );

      if (
        !claim.process
      ) {
        return new Response(
          null,
          {
            status:
              200,
          },
        );
      }

      if (
        action ===
        'DELETE'
      ) {
        await callInternalBackendJson(
          '/api/v1/internal/shopify/content-change/process-delete',
          {
            shopifyDomain:
              webhook.shop,

            eventId:
              claim.eventId,

            resourceType:
              configuration.resourceType,

            shopifyResourceId,
          },
        );

        return new Response(
          null,
          {
            status:
              200,
          },
        );
      }

      if (
        !webhook.admin
      ) {
        throw new Error(
          'Shopify offline session is unavailable for incremental translation scanning.',
        );
      }

      /*
       * No target locale means there is no translation
       * projection to update yet. The event is still
       * acknowledged and completed as an empty scan.
       */
      if (
        claim.targetLocales.length ===
        0
      ) {
        await callInternalBackendJson(
          '/api/v1/internal/shopify/content-change/process-upsert',
          {
            shopifyDomain:
              webhook.shop,

            eventId:
              claim.eventId,

            resourceType:
              configuration.resourceType,

            shopifyResourceId,

            content:
              [],

            locales:
              [],
          },
        );

        return new Response(
          null,
          {
            status:
              200,
          },
        );
      }

      const resource =
        await fetchIncrementalResource(
          webhook.admin,
          shopifyResourceId,
          claim.targetLocales,
        );

      /*
       * The resource may disappear between an UPDATE
       * delivery and the Admin API read. Treat that race
       * like a delete so the local projection never stays
       * active incorrectly.
       */
      if (!resource) {
        await callInternalBackendJson(
          '/api/v1/internal/shopify/content-change/process-delete',
          {
            shopifyDomain:
              webhook.shop,

            eventId:
              claim.eventId,

            resourceType:
              configuration.resourceType,

            shopifyResourceId,
          },
        );

        return new Response(
          null,
          {
            status:
              200,
          },
        );
      }

      await callInternalBackendJson(
        '/api/v1/internal/shopify/content-change/process-upsert',
        {
          shopifyDomain:
            webhook.shop,

          eventId:
            claim.eventId,

          resourceType:
            configuration.resourceType,

          shopifyResourceId:
            resource.resourceId,

          content:
            resource.content,

          locales:
            resource.locales,
        },
      );

      return new Response(
        null,
        {
          status:
            200,
        },
      );
    } catch (error) {
      const message =
        errorMessage(
          error,
        );

      console.error(
        `[ACA Locale] Incremental translation scan failed for ${auditTopic} ${shopifyResourceId}:`,
        error,
      );

      if (
        claim?.eventId
      ) {
        try {
          await callInternalBackendJson(
            '/api/v1/internal/shopify/content-change/fail',
            {
              shopifyDomain:
                webhook.shop,

              eventId:
                claim.eventId,

              errorMessage:
                message.slice(
                  0,
                  8000,
                ),
            },
          );
        } catch (
          failError
        ) {
          console.error(
            '[ACA Locale] Unable to persist failed content change event:',
            failError,
          );
        }
      }

      /*
       * Non-200 is intentional here. Shopify retries
       * failed deliveries and webhookId makes the next
       * attempt idempotent.
       */
      return new Response(
        'Incremental translation scan failed.',
        {
          status:
            500,
        },
      );
    }
  };
