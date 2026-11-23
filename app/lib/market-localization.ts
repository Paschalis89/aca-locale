/** Read-only projection of Shopify Markets configuration and ACA job history. */
export type MarketLocale = { locale: string; name?: string };
export type MarketPresence = {
  id?: string;
  subfolderSuffix?: string | null;
  defaultLocale?: MarketLocale | null;
  alternateLocales?: MarketLocale[] | null;
  rootUrls?: Array<{ locale?: string | null; url?: string | null }> | null;
};
export type ShopifyMarketSnapshot = {
  id: string;
  name: string;
  status?: string | null;
  handle?: string | null;
  webPresences?: { nodes?: MarketPresence[] | null } | null;
  conditions?: {
    regionsCondition?: {
      regions?: {
        nodes?: Array<{ __typename?: string; name?: string; code?: string | null }> | null;
        pageInfo?: { hasNextPage?: boolean } | null;
      } | null;
    } | null;
  } | null;
};
export type ShopifyLocaleSnapshot = {
  locale: string;
  name?: string;
  primary?: boolean;
  published?: boolean;
};
export type JobLocaleSnapshot = {
  targetLocale: string;
  status: string;
};
export type LocalizationMarketRow = {
  id: string;
  name: string;
  status: string;
  locales: string[];
  rootUrls: string[];
  hasWebPresence: boolean;
  countryCodes: string[];
  regionNames: string[];
  regionsTruncated: boolean;
  localization: 'CONFIGURED' | 'NO_WEB_PRESENCE' | 'NO_LOCALES';
  jobCount: number;
  completedJobCount: number;
  publishedLocales: string[];
  unpublishedLocales: string[];
};

export function normalizeLocale(input: unknown): string {
  return typeof input === 'string' ? input.trim().replace(/_/g, '-').toLowerCase() : '';
}

export function makeMarketLocalizationRows(
  markets: ShopifyMarketSnapshot[],
  locales: ShopifyLocaleSnapshot[],
  jobs: JobLocaleSnapshot[],
): LocalizationMarketRow[] {
  const published = new Set(locales.filter((item) => item.published).map((item) => normalizeLocale(item.locale)));
  return markets.map((market) => {
    const presences = market.webPresences?.nodes ?? [];
    const localeSet = new Set<string>();
    const urls = new Set<string>();
    for (const presence of presences) {
      const base = normalizeLocale(presence.defaultLocale?.locale);
      if (base) localeSet.add(base);
      for (const alternative of presence.alternateLocales ?? []) {
        const locale = normalizeLocale(alternative.locale);
        if (locale) localeSet.add(locale);
      }
      for (const root of presence.rootUrls ?? []) {
        const locale = normalizeLocale(root.locale);
        if (locale) localeSet.add(locale);
        // Display only URL data Shopify returns. Never synthesize market URLs.
        if (typeof root.url === 'string' && /^https:\/\//i.test(root.url)) urls.add(root.url);
      }
    }
    const regions = market.conditions?.regionsCondition?.regions;
    const countryCodes = [...new Set((regions?.nodes ?? [])
      .filter((node) => node.__typename === 'MarketRegionCountry' && typeof node.code === 'string' && /^[A-Z]{2}$/.test(node.code))
      .map((node) => node.code as string))].sort();
    const regionNames = [...new Set((regions?.nodes ?? [])
      .map((node) => typeof node.name === 'string' ? node.name : '')
      .filter(Boolean))].sort();
    const marketLocales = [...localeSet].sort();
    const matchingJobs = jobs.filter((job) => marketLocales.includes(normalizeLocale(job.targetLocale)));
    return {
      id: market.id,
      name: market.name,
      status: market.status ?? 'UNKNOWN',
      locales: marketLocales,
      rootUrls: [...urls].sort(),
      hasWebPresence: presences.length > 0,
      countryCodes,
      regionNames,
      regionsTruncated: regions?.pageInfo?.hasNextPage === true,
      localization: !presences.length ? 'NO_WEB_PRESENCE' : !marketLocales.length ? 'NO_LOCALES' : 'CONFIGURED',
      jobCount: matchingJobs.length,
      completedJobCount: matchingJobs.filter((job) => job.status === 'COMPLETED').length,
      publishedLocales: marketLocales.filter((locale) => published.has(locale)),
      unpublishedLocales: marketLocales.filter((locale) => !published.has(locale)),
    };
  });
}

export function summarizeLocalization(
  markets: ShopifyMarketSnapshot[],
  locales: ShopifyLocaleSnapshot[],
  jobs: JobLocaleSnapshot[],
) {
  const rows = makeMarketLocalizationRows(markets, locales, jobs);
  return {
    rows,
    marketCount: rows.length,
    marketsWithWebPresence: rows.filter((row) => row.hasWebPresence).length,
    publishedLocaleCount: locales.filter((item) => item.published).length,
    jobsWithMarketLocale: jobs.filter((job) => rows.some((row) => row.locales.includes(normalizeLocale(job.targetLocale)))).length,
    jobsWithoutMarketLocale: jobs.filter((job) => !rows.some((row) => row.locales.includes(normalizeLocale(job.targetLocale)))).length,
    marketsWithoutDedicatedWebPresence: rows.filter((row) => !row.hasWebPresence).length,
    // Lack of web-presence locale mappings means these jobs cannot be attributed to a market.
    // It is NOT proof of missing translations or store-wide publishing failure.
    jobsWithoutVerifiableMarketMapping: jobs.filter((job) => !rows.some((row) => row.locales.includes(normalizeLocale(job.targetLocale)))).length,
  };
}
