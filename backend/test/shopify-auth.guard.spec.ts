import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { ShopifyAuthGuard } from '../src/shopify-auth/shopify-auth.guard.js';

const API_KEY = 'test-api-key';
const API_SECRET = 'test-api-secret-that-is-long-enough';

function createGuard() {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'SHOPIFY_API_KEY') return API_KEY;
      if (key === 'SHOPIFY_API_SECRET') return API_SECRET;
      return undefined;
    }),
  };

  return new ShopifyAuthGuard(config as any);
}

function createContext(authorization?: string) {
  const request: any = {
    headers: {
      authorization,
    },
  };

  const response = {
    setHeader: vi.fn(),
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };

  return {
    request,
    response,
    context: context as any,
  };
}

async function signToken(input?: {
  dest?: string;
  issuer?: string;
  audience?: string;
  subject?: string;
  sessionId?: string;
}) {
  const dest = input?.dest ?? 'https://aca-test.myshopify.com';
  const issuer = input?.issuer ?? 'https://aca-test.myshopify.com/admin';

  return new SignJWT({
    dest,
    sid: input?.sessionId ?? 'session-1',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience(input?.audience ?? API_KEY)
    .setIssuer(issuer)
    .setSubject(input?.subject ?? 'user-1')
    .sign(new TextEncoder().encode(API_SECRET));
}

describe('ShopifyAuthGuard', () => {
  it('accepts a valid Shopify ID token and attaches tenant context', async () => {
    const guard = createGuard();
    const token = await signToken({});
    const { context, request, response } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.shopifyAuth).toEqual({
      shopDomain: 'aca-test.myshopify.com',
      destination: 'https://aca-test.myshopify.com',
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token and asks Shopify to retry the session request', async () => {
    const guard = createGuard();
    const { context, response } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Shopify-Retry-Invalid-Session-Request',
      '1',
    );
  });

  it('rejects a token whose issuer belongs to a different shop', async () => {
    const guard = createGuard();
    const token = await signToken({
      issuer: 'https://other-shop.myshopify.com/admin',
    });
    const { context, response } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Shopify-Retry-Invalid-Session-Request',
      '1',
    );
  });

  it('rejects a destination that is not a myshopify.com domain', async () => {
    const guard = createGuard();
    const token = await signToken({
      dest: 'https://example.com',
      issuer: 'https://example.com/admin',
    });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
