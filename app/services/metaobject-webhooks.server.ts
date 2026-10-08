type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type MetaobjectDefinitionNode = {
  type: string;
  capabilities?: {
    translatable?: {
      enabled?: boolean | null;
    } | null;
  } | null;
};

type WebhookSubscriptionNode = {
  id: string;
  topic: string;
  filter?: string | null;
  uri: string;
};

type MutationUserError = {
  field?: string[] | null;
  message: string;
};

const METAOBJECT_WEBHOOK_TOPICS = [
  "METAOBJECTS_CREATE",
  "METAOBJECTS_UPDATE",
  "METAOBJECTS_DELETE",
] as const;

const METAOBJECT_WEBHOOK_PATH = "/webhooks/translation-content";
const FILTER_CHUNK_SIZE = 25;

function requiredAppUrl() {
  const value = process.env.SHOPIFY_APP_URL?.trim();

  if (!value) {
    throw new Error("SHOPIFY_APP_URL is not configured.");
  }

  return value;
}

function callbackUri(groupIndex = 0, groupCount = 1) {
  const url = new URL(METAOBJECT_WEBHOOK_PATH, requiredAppUrl());

  /*
   * Shopify only allows one webhook subscription for the same
   * topic + callback address. If a large set of Metaobject types
   * ever needs more than one filter group, give each group its
   * own stable callback URI while keeping the same route path.
   */
  if (groupCount > 1) {
    url.searchParams.set("aca_metaobject_group", String(groupIndex));
  }

  return url.toString();
}

function isManagedMetaobjectWebhookUri(uri: string) {
  try {
    return new URL(uri).pathname === METAOBJECT_WEBHOOK_PATH;
  } catch {
    return uri.endsWith(METAOBJECT_WEBHOOK_PATH);
  }
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function buildMetaobjectFilters(types: string[]) {
  return chunk(types, FILTER_CHUNK_SIZE).map((items) =>
    items.map((type) => `type:${type}`).join(" OR "),
  );
}

function formatUserErrors(errors: MutationUserError[] | undefined) {
  if (!errors?.length) return "";

  return errors
    .map((error) => {
      const field = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${field}${error.message}`;
    })
    .join("; ");
}

async function graphqlJson<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const json = (await response.json()) as {
    data?: T;
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL failed: ${JSON.stringify(json.errors)}`);
  }

  if (!json.data) {
    throw new Error("Shopify GraphQL returned no data.");
  }

  return json.data;
}

async function fetchTranslatableMetaobjectTypes(admin: AdminGraphqlClient) {
  const types = new Set<string>();
  let after: string | null = null;

  do {
    const data: {
      metaobjectDefinitions: {
        nodes: MetaobjectDefinitionNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor?: string | null;
        };
      };
    } = await graphqlJson(
      admin,
      `#graphql
        query AcaLocaleMetaobjectDefinitions($after: String) {
          metaobjectDefinitions(first: 100, after: $after) {
            nodes {
              type
              capabilities {
                translatable {
                  enabled
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after },
    );

    for (const definition of data.metaobjectDefinitions.nodes ?? []) {
      if (definition.capabilities?.translatable?.enabled === true) {
        types.add(definition.type);
      }
    }

    after = data.metaobjectDefinitions.pageInfo.hasNextPage
      ? data.metaobjectDefinitions.pageInfo.endCursor ?? null
      : null;
  } while (after);

  return Array.from(types).sort((left, right) => left.localeCompare(right));
}

async function fetchMetaobjectWebhookSubscriptions(admin: AdminGraphqlClient) {
  const subscriptions: WebhookSubscriptionNode[] = [];
  let after: string | null = null;

  do {
    const data: {
      webhookSubscriptions: {
        nodes: WebhookSubscriptionNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor?: string | null;
        };
      };
    } = await graphqlJson(
      admin,
      `#graphql
        query AcaLocaleMetaobjectWebhookSubscriptions($after: String) {
          webhookSubscriptions(
            first: 100
            after: $after
            topics: [METAOBJECTS_CREATE, METAOBJECTS_UPDATE, METAOBJECTS_DELETE]
          ) {
            nodes {
              id
              topic
              filter
              uri
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after },
    );

    subscriptions.push(...(data.webhookSubscriptions.nodes ?? []));

    after = data.webhookSubscriptions.pageInfo.hasNextPage
      ? data.webhookSubscriptions.pageInfo.endCursor ?? null
      : null;
  } while (after);

  return subscriptions.filter((subscription) =>
    isManagedMetaobjectWebhookUri(subscription.uri),
  );
}

async function createWebhookSubscription(
  admin: AdminGraphqlClient,
  topic: (typeof METAOBJECT_WEBHOOK_TOPICS)[number],
  uri: string,
  filter: string,
) {
  const data: {
    webhookSubscriptionCreate: {
      webhookSubscription?: WebhookSubscriptionNode | null;
      userErrors: MutationUserError[];
    };
  } = await graphqlJson(
    admin,
    `#graphql
      mutation AcaLocaleCreateMetaobjectWebhook(
        $topic: WebhookSubscriptionTopic!
        $webhookSubscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: $webhookSubscription
        ) {
          webhookSubscription {
            id
            topic
            filter
            uri
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      topic,
      webhookSubscription: {
        uri,
        filter,
      },
    },
  );

  const errors = data.webhookSubscriptionCreate.userErrors;

  if (!errors.length) {
    return {
      subscription: data.webhookSubscriptionCreate.webhookSubscription ?? null,
      created: true,
      updated: false,
      recoveredFromRace: false,
    };
  }

  const addressTaken = errors.some((error) =>
    error.message
      .toLowerCase()
      .includes("address for this topic has already been taken"),
  );

  if (addressTaken) {
    /*
     * Reconciliation can be triggered at the same time by a manual
     * Shopify sync and by one or more MetaobjectDefinition events.
     * Two requests can therefore both observe "missing" and race to
     * create the same webhook. Shopify correctly rejects the loser.
     * Treat that response as an idempotency race, re-read Shopify,
     * and converge on the subscription that won.
     */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await fetchMetaobjectWebhookSubscriptions(admin);
      const sameAddress = existing.find(
        (subscription) => subscription.topic === topic && subscription.uri === uri,
      );

      if (sameAddress) {
        if (sameAddress.filter !== filter) {
          const updatedSubscription = await updateWebhookSubscription(
            admin,
            sameAddress.id,
            uri,
            filter,
          );

          return {
            subscription: updatedSubscription,
            created: false,
            updated: true,
            recoveredFromRace: true,
          };
        }

        return {
          subscription: sameAddress,
          created: false,
          updated: false,
          recoveredFromRace: true,
        };
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  throw new Error(
    `Unable to create ${topic} metaobject webhook: ${formatUserErrors(errors)}`,
  );
}

async function updateWebhookSubscription(
  admin: AdminGraphqlClient,
  id: string,
  uri: string,
  filter: string,
) {
  const data: {
    webhookSubscriptionUpdate: {
      webhookSubscription?: WebhookSubscriptionNode | null;
      userErrors: MutationUserError[];
    };
  } = await graphqlJson(
    admin,
    `#graphql
      mutation AcaLocaleUpdateMetaobjectWebhook(
        $id: ID!
        $webhookSubscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionUpdate(
          id: $id
          webhookSubscription: $webhookSubscription
        ) {
          webhookSubscription {
            id
            topic
            filter
            uri
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id,
      webhookSubscription: {
        uri,
        filter,
      },
    },
  );

  const errors = data.webhookSubscriptionUpdate.userErrors;
  if (errors.length) {
    throw new Error(
      `Unable to update metaobject webhook ${id}: ${formatUserErrors(errors)}`,
    );
  }

  return data.webhookSubscriptionUpdate.webhookSubscription ?? null;
}

async function deleteWebhookSubscription(admin: AdminGraphqlClient, id: string) {
  const data: {
    webhookSubscriptionDelete: {
      deletedWebhookSubscriptionId?: string | null;
      userErrors: MutationUserError[];
    };
  } = await graphqlJson(
    admin,
    `#graphql
      mutation AcaLocaleDeleteMetaobjectWebhook($id: ID!) {
        webhookSubscriptionDelete(id: $id) {
          deletedWebhookSubscriptionId
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id },
  );

  const errors = data.webhookSubscriptionDelete.userErrors;
  if (errors.length) {
    throw new Error(
      `Unable to delete metaobject webhook ${id}: ${formatUserErrors(errors)}`,
    );
  }

  return data.webhookSubscriptionDelete.deletedWebhookSubscriptionId ?? id;
}

export async function syncMetaobjectWebhookSubscriptions(
  admin: AdminGraphqlClient,
) {
  const types = await fetchTranslatableMetaobjectTypes(admin);
  const desiredFilters = buildMetaobjectFilters(types);
  const desired = desiredFilters.map((filter, index) => ({
    filter,
    uri: callbackUri(index, desiredFilters.length),
  }));
  const existing = await fetchMetaobjectWebhookSubscriptions(admin);

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;
  let raceRecoveries = 0;

  for (const topic of METAOBJECT_WEBHOOK_TOPICS) {
    const current = existing
      .filter((subscription) => subscription.topic === topic)
      .sort((left, right) => left.id.localeCompare(right.id));

    const consumed = new Set<string>();

    for (const wanted of desired) {
      const exact = current.find(
        (subscription) =>
          !consumed.has(subscription.id) &&
          subscription.uri === wanted.uri &&
          subscription.filter === wanted.filter,
      );

      if (exact) {
        consumed.add(exact.id);
        unchanged += 1;
        continue;
      }

      const sameAddress = current.find(
        (subscription) =>
          !consumed.has(subscription.id) && subscription.uri === wanted.uri,
      );

      if (sameAddress) {
        await updateWebhookSubscription(
          admin,
          sameAddress.id,
          wanted.uri,
          wanted.filter,
        );
        consumed.add(sameAddress.id);
        updated += 1;
        continue;
      }

      const reusable = current.find(
        (subscription) => !consumed.has(subscription.id),
      );

      if (reusable) {
        await updateWebhookSubscription(
          admin,
          reusable.id,
          wanted.uri,
          wanted.filter,
        );
        consumed.add(reusable.id);
        updated += 1;
        continue;
      }

      const creation = await createWebhookSubscription(
        admin,
        topic,
        wanted.uri,
        wanted.filter,
      );

      if (creation.recoveredFromRace) {
        raceRecoveries += 1;
      }

      if (creation.created) {
        created += 1;
      } else if (creation.updated) {
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    for (const stale of current.filter((subscription) => !consumed.has(subscription.id))) {
      /*
       * If there are no desired filters, every managed subscription
       * for this topic is stale and is removed. Otherwise only
       * subscriptions not reused above are deleted.
       */
      await deleteWebhookSubscription(admin, stale.id);
      deleted += 1;
    }
  }

  return {
    callbackUri: callbackUri(),
    callbackUris: desired.map((entry) => entry.uri),
    translatableMetaobjectTypes: types,
    typeCount: types.length,
    filterGroups: desiredFilters.length,
    subscriptions: {
      created,
      updated,
      deleted,
      unchanged,
      raceRecoveries,
    },
  };
}
