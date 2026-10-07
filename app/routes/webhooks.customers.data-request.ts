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
   * ACA Locale stores translation/configuration
   * data, not Shopify customer records.
   * The verified compliance request is therefore
   * acknowledged without returning customer data.
   */
  console.info(
    `[ACA Locale] Customer data request acknowledged for ${shop}. No customer data is stored by ACA Locale.`,
  );

  return new Response(
    null,
    {
      status:
        200,
    },
  );
};
