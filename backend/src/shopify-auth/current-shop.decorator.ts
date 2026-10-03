import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import type {
  ShopifyAuthenticatedRequest,
  ShopifyAuthContext,
} from './shopify-auth.types.js';

export const CurrentShop =
  createParamDecorator(
    (
      _data: unknown,
      context: ExecutionContext,
    ): ShopifyAuthContext => {
      const request =
        context
          .switchToHttp()
          .getRequest<ShopifyAuthenticatedRequest>();

      if (!request.shopifyAuth) {
        throw new Error(
          'Shopify authentication context is missing.',
        );
      }

      return request.shopifyAuth;
    },
  );