export async function callInternalBackend(
  path:
    string,

  body:
    Record<string, unknown>,
) {
  const backendUrl =
    process.env.ACA_LOCALE_BACKEND_URL ??
    'http://127.0.0.1:3001';

  const secret =
    process.env.ACA_LOCALE_INTERNAL_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'ACA_LOCALE_INTERNAL_SECRET is not configured.',
    );
  }

  const response =
    await fetch(
      `${backendUrl}${path}`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          'X-ACA-Locale-Internal-Secret':
            secret,
        },

        body:
          JSON.stringify(
            body,
          ),
      },
    );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      `ACA Locale backend returned ${response.status}: ${responseText}`,
    );
  }

  return response;
}
