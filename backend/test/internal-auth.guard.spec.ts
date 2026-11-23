import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InternalAuthGuard } from '../src/internal/internal-auth.guard.js';

const SECRET = 'a-test-secret-which-must-not-be-logged';
function makeGuard(configured: string | undefined, supplied: string | string[] | undefined) {
  const guard = new InternalAuthGuard({
    get: vi.fn(() => configured),
  } as any);
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({
      headers: { 'x-aca-locale-internal-secret': supplied },
    }) }),
  } as any;
  return { guard, ctx };
}

describe('InternalAuthGuard security', () => {
  it('accepts exactly one matching secret', () => {
    const { guard, ctx } = makeGuard(SECRET, SECRET);
    expect(guard.canActivate(ctx)).toBe(true);
  });
  it('rejects a missing configured secret', () => {
    const { guard, ctx } = makeGuard(undefined, SECRET);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
  it('rejects a missing supplied secret', () => {
    const { guard, ctx } = makeGuard(SECRET, undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
  it('rejects mismatched secrets', () => {
    const { guard, ctx } = makeGuard(SECRET, SECRET + 'x');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
  it('rejects duplicate secret headers even when first matches', () => {
    const { guard, ctx } = makeGuard(SECRET, [SECRET, 'wrong-secret']);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
