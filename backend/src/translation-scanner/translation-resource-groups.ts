export const TRANSLATION_RESOURCE_GROUPS = {
  CONTENT: [
    'ARTICLE',
    'ARTICLE_IMAGE',
    'BLOG',
    'COLLECTION',
    'COLLECTION_IMAGE',
    'MEDIA_IMAGE',
    'MENU',
    'PAGE',
    'PRODUCT',
    'PRODUCT_OPTION',
    'PRODUCT_OPTION_VALUE',
    'SHOP_POLICY',
  ],

  CUSTOM_DATA: [
    'METAFIELD',
    'METAOBJECT',
  ],

  COMMERCE: [
    'DELIVERY_METHOD_DEFINITION',
    'FILTER',
    'LINK',
    'PAYMENT_GATEWAY',
    'SELLING_PLAN',
    'SELLING_PLAN_GROUP',
  ],

  THEME: [
    'ONLINE_STORE_THEME',
    'ONLINE_STORE_THEME_APP_EMBED',
    'ONLINE_STORE_THEME_JSON_TEMPLATE',
    'ONLINE_STORE_THEME_LOCALE_CONTENT',
    'ONLINE_STORE_THEME_SECTION_GROUP',
    'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
    'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
  ],

  SYSTEM: [
    'EMAIL_TEMPLATE',
    'PACKING_SLIP_TEMPLATE',
    'SHOP',
  ],
} as const;

export type TranslationResourceGroup =
  | keyof typeof TRANSLATION_RESOURCE_GROUPS
  | 'OTHER';

export const SHOPIFY_TRANSLATION_RESOURCE_TYPES = [
  ...TRANSLATION_RESOURCE_GROUPS.CONTENT,
  ...TRANSLATION_RESOURCE_GROUPS.CUSTOM_DATA,
  ...TRANSLATION_RESOURCE_GROUPS.COMMERCE,
  ...TRANSLATION_RESOURCE_GROUPS.THEME,
  ...TRANSLATION_RESOURCE_GROUPS.SYSTEM,
] as const;

export function getTranslationResourceGroup(
  resourceType: string,
): TranslationResourceGroup {
  for (
    const [
      group,
      resourceTypes,
    ] of Object.entries(
      TRANSLATION_RESOURCE_GROUPS,
    )
  ) {
    if (
      (
        resourceTypes as readonly string[]
      ).includes(
        resourceType,
      )
    ) {
      return group as keyof typeof TRANSLATION_RESOURCE_GROUPS;
    }
  }

  /*
   * Future Shopify API versions may
   * introduce new resource types.
   *
   * We do not want an API upgrade
   * to break the dashboard.
   */
  return 'OTHER';
}