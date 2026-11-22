import type { LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return Response.json({ message: 'Missing Shopify ID token.' }, { status: 401 });
  const backendUrl = process.env.ACA_LOCALE_BACKEND_URL ?? 'http://127.0.0.1:3001';
  try {
    const response = await fetch(`${backendUrl}/api/v1/translations/jobs/automation/monitor`, {
      headers: { Authorization: authorization },
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({ message: 'Unable to load automation monitor.' }, { status: 502 });
  }
}
