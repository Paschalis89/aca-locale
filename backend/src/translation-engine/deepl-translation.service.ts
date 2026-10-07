import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';

import {
  AiRegistryService,
} from '../ai/ai-registry.service.js';

export type DeepLTranslateInput = {
  text: string;

  sourceLocale: string;

  targetLocale: string;

  contentType?: string;
};

export type DeepLTranslateResult = {
  text: string;

  detectedSourceLanguage?:
    string;

  billedCharacters?:
    number;
};

@Injectable()
export class DeepLTranslationService {
  constructor(
    private readonly aiRegistry:
      AiRegistryService,
  ) {}

  async translate(
    input: DeepLTranslateInput,
  ): Promise<DeepLTranslateResult> {
    const {
      apiKey,
      apiUrl,
    } =
      this.aiRegistry
        .getDeepLConfiguration();

    const sourceLang =
      this.toDeepLSourceLanguage(
        input.sourceLocale,
      );

    const targetLang =
      this.toDeepLTargetLanguage(
        input.targetLocale,
      );

    const isHtml =
      input.contentType
        ?.toUpperCase() ===
      'HTML';

    const body:
      Record<string, unknown> = {
        text: [
          input.text,
        ],

        source_lang:
          sourceLang,

        target_lang:
          targetLang,

        show_billed_characters:
          true,

        preserve_formatting:
          true,
      };

    if (isHtml) {
      body.tag_handling =
        'html';

      body.tag_handling_version =
        'v2';
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        20_000,
      );

    try {
      const response =
        await fetch(
          `${apiUrl}/v2/translate`,
          {
            method:
              'POST',

            headers: {
              Authorization:
                `DeepL-Auth-Key ${apiKey}`,

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(
                body,
              ),

            signal:
              controller.signal,
          },
        );

      const rawBody =
        await response.text();

      let data:
        {
          translations?: Array<{
            text?: string;

            detected_source_language?:
              string;

            billed_characters?:
              number;
          }>;

          message?:
            string;

          code?:
            string;
        } = {};

      if (rawBody) {
        try {
          data =
            JSON.parse(
              rawBody,
            );
        } catch {
          // Leave data empty.
        }
      }

      if (!response.ok) {
        throw new BadGatewayException(
          data.message ??
            data.code ??
            `DeepL returned HTTP ${response.status}.`,
        );
      }

      const translation =
        data.translations?.[0];

      if (
        !translation?.text
      ) {
        throw new BadGatewayException(
          'DeepL returned no translation.',
        );
      }

      return {
        text:
          translation.text,

        detectedSourceLanguage:
          translation
            .detected_source_language,

        billedCharacters:
          translation
            .billed_characters,
      };
    } catch (error) {
      if (
        error instanceof
        BadGatewayException
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name ===
          'AbortError'
      ) {
        throw new BadGatewayException(
          'DeepL request timed out.',
        );
      }

      throw new BadGatewayException(
        error instanceof Error
          ? error.message
          : 'DeepL translation failed.',
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  private toDeepLSourceLanguage(
    locale:
      string,
  ) {
    const normalized =
      locale
        .trim()
        .replace(
          '_',
          '-',
        )
        .toUpperCase();

    /*
     * DeepL source languages generally use
     * the root language rather than regional
     * Shopify variants.
     *
     * en-US -> EN
     * en-GB -> EN
     * pt-BR -> PT
     */
    return normalized
      .split(
        '-',
      )[0];
  }

  private toDeepLTargetLanguage(
    locale:
      string,
  ) {
    const normalized =
      locale
        .trim()
        .replace(
          '_',
          '-',
        )
        .toUpperCase();

    /*
     * Preserve the DeepL target variants
     * for locales where the regional/script
     * distinction matters.
     */
    const explicitMappings:
      Record<string, string> = {
        'EN-US':
          'EN-US',

        'EN-GB':
          'EN-GB',

        'PT-BR':
          'PT-BR',

        'PT-PT':
          'PT-PT',

        'ZH-HANS':
          'ZH-HANS',

        'ZH-HANT':
          'ZH-HANT',
      };

    return (
      explicitMappings[
        normalized
      ] ??
      normalized.split(
        '-',
      )[0]
    );
  }
}