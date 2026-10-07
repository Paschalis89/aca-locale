import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('ACA Locale API')
    .setDescription(
      [
        'Technical API documentation for ACA Locale.',
        '',
        'ACA Locale is an AI-powered localization management platform.',
        '',
        'This specification is generated automatically from the NestJS backend.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
