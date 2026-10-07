import type {
  ActionFunctionArgs,
} from 'react-router';

import {
  authenticate,
} from '../shopify.server';

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    shop,
  } = await authenticate.webhook(
    request,
  );

  /*
   * ACA Locale does not persist Shopify customer
   * records, so there is no customer-scoped data
   * to redact after Shopify authenticates this hook.
   */
  console.info(
    `[ACA Locale] Customer redaction acknowledged for ${shop}. No customer data is stored by ACA Locale.`,
  );

  return new Response(
    null,
    {
      status:
        200,
    },
  );
};
