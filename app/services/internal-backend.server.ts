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

export async function callInternalBackendJson<T>(
  path:
    string,

  body:
    Record<string, unknown>,
): Promise<T> {
  const response =
    await callInternalBackend(
      path,
      body,
    );

  const text =
    await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(
      text,
    ) as T;
  } catch {
    throw new Error(
      `ACA Locale backend returned invalid JSON for ${path}.`,
    );
  }
}
