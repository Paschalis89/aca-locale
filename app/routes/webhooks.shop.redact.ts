import type {
  ActionFunctionArgs,
} from 'react-router';

import prisma from '../db.server';

import {
  authenticate,
} from '../shopify.server';

import {
  callInternalBackend,
} from '../services/internal-backend.server';

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    shop,
  } = await authenticate.webhook(
    request,
  );

  await callInternalBackend(
    '/api/v1/internal/shopify/shop-redact',
    {
      shopifyDomain:
        shop,
    },
  );

  await prisma.session.deleteMany({
    where: {
      shop,
    },
  });

  return new Response(
    null,
    {
      status:
        200,
    },
  );
};
