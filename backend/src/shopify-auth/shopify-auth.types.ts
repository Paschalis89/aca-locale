export interface ShopifyAuthContext {
  shopDomain: string;

  userId?: string;

  sessionId?: string;

  destination: string;
}

export interface ShopifyAuthenticatedRequest {
  headers: {
    authorization?: string;
  };

  shopifyAuth?: ShopifyAuthContext;
}
