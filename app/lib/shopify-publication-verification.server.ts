/** Read-only verification of a published, global Shopify translation. */
export type PublicationVerificationStatus =
  | "VERIFIED"
  | "MISMATCH"
  | "VERIFICATION_FAILED";

export type PublicationVerification = {
  status: PublicationVerificationStatus;
  resourceId: string;
  fieldKey: string;
  locale: string;
  expectedValue: string;
  actualValue: string | null;
  outdated: boolean | null;
  verifiedAt: string;
  reason?: string;
};

type VerificationInput = {
  resourceId: string;
  fieldKey: string;
  locale: string;
  approvedValue: string;
};

export function compareShopifyTranslation(
  input: VerificationInput,
  translations: unknown,
  verifiedAt = new Date().toISOString(),
): PublicationVerification {
  const base = {
    resourceId: input.resourceId,
    fieldKey: input.fieldKey,
    locale: input.locale,
    expectedValue: input.approvedValue,
    verifiedAt,
  };
  if (!Array.isArray(translations)) {
    return { ...base, status: "VERIFICATION_FAILED", actualValue: null,
      outdated: null, reason: "Shopify returned no translations array." };
  }
  const candidates = translations.filter((item: any) =>
    item && item.key === input.fieldKey && item.locale === input.locale &&
    !item.market?.id,
  );
  if (candidates.length !== 1) {
    return { ...base, status: "MISMATCH", actualValue: null,
      outdated: null, reason: candidates.length === 0
        ? "No matching global Shopify translation exists."
        : "Multiple matching global Shopify translations returned." };
  }
  const translation = candidates[0];
  if (typeof translation.value !== "string" ||
      typeof translation.outdated !== "boolean") {
    return { ...base, status: "VERIFICATION_FAILED", actualValue: null,
      outdated: null, reason: "Shopify returned an incomplete translation." };
  }
  const exactMatch = translation.value === input.approvedValue;
  const current = !translation.outdated;
  return {
    ...base,
    status: exactMatch && current ? "VERIFIED" : "MISMATCH",
    actualValue: translation.value,
    outdated: translation.outdated,
    ...(!exactMatch ? { reason: "Shopify translation differs from approvedValue (exact comparison)." }
      : !current ? { reason: "Shopify marks the translation as outdated." }
      : {}),
  };
}

export async function readBackShopifyTranslation(
  admin: { graphql: (query: string, args: { variables: Record<string, string> }) => Promise<{ json: () => Promise<any> }> },
  input: VerificationInput,
): Promise<PublicationVerification> {
  const verifiedAt = new Date().toISOString();
  try {
    const response = await admin.graphql(
      `#graphql
        query AcaLocaleVerifyPublication($resourceId: ID!, $locale: String!) {
          translatableResource(resourceId: $resourceId) {
            resourceId
            translations(locale: $locale) {
              key
              locale
              value
              outdated
              market { id }
            }
          }
        }
      `,
      { variables: { resourceId: input.resourceId, locale: input.locale } },
    );
    const json = await response.json();
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw new Error("Shopify GraphQL returned errors.");
    }
    const resource = json.data?.translatableResource;
    if (!resource || resource.resourceId !== input.resourceId) {
      throw new Error("Shopify did not return the requested resource.");
    }
    return compareShopifyTranslation(input, resource.translations, verifiedAt);
  } catch (error) {
    return {
      ...input,
      expectedValue: input.approvedValue,
      status: "VERIFICATION_FAILED",
      actualValue: null,
      outdated: null,
      verifiedAt,
      reason: error instanceof Error ? error.message : "Unknown Shopify read-back error.",
    };
  }
}
