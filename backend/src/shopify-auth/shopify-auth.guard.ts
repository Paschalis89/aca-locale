import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  jwtVerify,
} from 'jose';

import type {
  ShopifyAuthenticatedRequest,
} from './shopify-auth.types.js';

@Injectable()
export class ShopifyAuthGuard
  implements CanActivate
{
  constructor(
    private readonly configService:
      ConfigService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const httpContext =
      context.switchToHttp();

    const request =
      httpContext.getRequest<ShopifyAuthenticatedRequest>();

    const response =
      httpContext.getResponse<{
        setHeader(
          name: string,
          value: string,
        ): void;
      }>();

    const fail = (
      message: string,
    ): never => {
      response.setHeader(
        'X-Shopify-Retry-Invalid-Session-Request',
        '1',
      );

      throw new UnauthorizedException(
        message,
      );
    };

    const authorizationHeader =
      request.headers.authorization;

    if (
      typeof authorizationHeader !== 'string' ||
      !authorizationHeader.startsWith('Bearer ')
    ) {
      return fail(
        'Missing Shopify ID token.',
      );
    }

    const token =
      authorizationHeader
        .slice('Bearer '.length)
        .trim();

    if (!token) {
      return fail(
        'Missing Shopify ID token.',
      );
    }

    const apiKey =
      this.configService.get<string>(
        'SHOPIFY_API_KEY',
      );

    const apiSecret =
      this.configService.get<string>(
        'SHOPIFY_API_SECRET',
      );

    if (!apiKey || !apiSecret) {
      throw new Error(
        'Shopify authentication is not configured.',
      );
    }

    try {
      const secret =
        new TextEncoder().encode(
          apiSecret,
        );

      const {
        payload,
      } = await jwtVerify(
        token,
        secret,
        {
          algorithms: [
            'HS256',
          ],

          audience:
            apiKey,

          clockTolerance:
            5,
        },
      );

      /*
       * "dest" is a Shopify-specific JWT claim,
       * therefore jose correctly exposes it as unknown.
       */
      const destinationClaim =
        payload['dest'];

      const issuerClaim =
        payload.iss;

      if (
        typeof destinationClaim !== 'string' ||
        typeof issuerClaim !== 'string'
      ) {
        return fail(
          'Invalid Shopify ID token claims.',
        );
      }

      let destinationUrl: URL;
      let issuerUrl: URL;

      try {
        destinationUrl =
          new URL(
            destinationClaim,
          );

        issuerUrl =
          new URL(
            issuerClaim,
          );
      } catch {
        return fail(
          'Invalid Shopify ID token URLs.',
        );
      }

      if (
        destinationUrl.protocol !== 'https:'
      ) {
        return fail(
          'Invalid Shopify destination.',
        );
      }

      if (
        issuerUrl.protocol !== 'https:'
      ) {
        return fail(
          'Invalid Shopify issuer.',
        );
      }

      if (
        destinationUrl.hostname !==
        issuerUrl.hostname
      ) {
        return fail(
          'Shopify issuer does not match destination.',
        );
      }

      const shopDomain =
        destinationUrl.hostname
          .toLowerCase();

      if (
        !shopDomain.endsWith(
          '.myshopify.com',
        )
      ) {
        return fail(
          'Invalid Shopify shop domain.',
        );
      }

      request.shopifyAuth = {
        shopDomain,

        destination:
          destinationClaim,

        userId:
          typeof payload.sub === 'string'
            ? payload.sub
            : undefined,

        sessionId:
          typeof payload['sid'] === 'string'
            ? payload['sid']
            : undefined,
      };

      return true;
    } catch (error) {
      if (
        error instanceof
        UnauthorizedException
      ) {
        throw error;
      }

      return fail(
        'Invalid or expired Shopify ID token.',
      );
    }
  }
}