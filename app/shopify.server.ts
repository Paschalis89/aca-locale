import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

import {
  PrismaSessionStorage,
} from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";

function requiredEnvironmentVariable(
  name: string,
) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

function resolveDistribution() {
  const value =
    process.env.SHOPIFY_APP_DISTRIBUTION
      ?.trim()
      .toLowerCase() ||
    "app_store";

  if (value === "single_merchant") {
    return AppDistribution.SingleMerchant;
  }

  if (value === "app_store") {
    return AppDistribution.AppStore;
  }

  throw new Error(
    'SHOPIFY_APP_DISTRIBUTION must be "app_store" or "single_merchant".',
  );
}

const shopify = shopifyApp({
  apiKey:
    requiredEnvironmentVariable(
      "SHOPIFY_API_KEY",
    ),

  apiSecretKey:
    requiredEnvironmentVariable(
      "SHOPIFY_API_SECRET",
    ),

  apiVersion:
    ApiVersion.July26,

  scopes:
    process.env.SCOPES
      ?.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),

  appUrl:
    requiredEnvironmentVariable(
      "SHOPIFY_APP_URL",
    ),

  authPathPrefix:
    "/auth",

  sessionStorage:
    new PrismaSessionStorage(
      prisma,
    ),

  distribution:
    resolveDistribution(),

  future: {
    expiringOfflineAccessTokens:
      true,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? {
        customShopDomains: [
          process.env.SHOP_CUSTOM_DOMAIN,
        ],
      }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
