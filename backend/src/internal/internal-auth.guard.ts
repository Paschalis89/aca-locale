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
  timingSafeEqual,
} from 'node:crypto';

@Injectable()
export class InternalAuthGuard
implements CanActivate {
  constructor(
    private readonly config:
      ConfigService,
  ) {}

  canActivate(
    context:
      ExecutionContext,
  ) {
    const request =
      context.switchToHttp()
        .getRequest<{
          headers: Record<string, string | string[] | undefined>;
        }>();

    const expected =
      this.config.get<string>(
        'ACA_LOCALE_INTERNAL_SECRET',
      )?.trim();

    if (!expected) {
      throw new UnauthorizedException(
        'Internal API authentication is not configured.',
      );
    }

    const rawProvided =
      request.headers[
        'x-aca-locale-internal-secret'
      ];

    const provided =
      Array.isArray(rawProvided)
        ? rawProvided[0]
        : rawProvided;

    if (!provided) {
      throw new UnauthorizedException(
        'Missing internal API secret.',
      );
    }

    const expectedBuffer =
      Buffer.from(expected);

    const providedBuffer =
      Buffer.from(provided);

    if (
      expectedBuffer.length !==
      providedBuffer.length ||
      !timingSafeEqual(
        expectedBuffer,
        providedBuffer,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid internal API secret.',
      );
    }

    return true;
  }
}
