import type { VercelRequest, VercelResponse } from '@vercel/node';

// Duración máxima de función serverless en Vercel (permite hasta 60s para absorber Render cold starts)
export const maxDuration = 60;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Verificar autenticación de Vercel Cron si CRON_SECRET está configurado
  const authHeader = request.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const requestedWindow = typeof request.query?.window === 'string' ? request.query.window : undefined;
    const utcHour = new Date().getUTCHours();
    const inferredWindow = (utcHour >= 12 && utcHour <= 16) ? 'morning' : ((utcHour >= 22 || utcHour <= 2) ? 'evening' : '');
    const windowParam = requestedWindow || inferredWindow;

    const backendUrl = process.env.BACKEND_API_URL || process.env.VITE_API_URL || 'http://localhost:8000/api';
    const apiUrl = backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`;
    
    console.log(`Disparando cron de notificaciones en: ${apiUrl}/push/cron (window: ${windowParam || 'all'})`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    const params = new URLSearchParams();
    if (cronSecret) params.set('token', cronSecret);
    if (windowParam) params.set('window', windowParam);
    const queryString = params.toString();
    const targetUrl = `${apiUrl}/push/cron${queryString ? `?${queryString}` : ''}`;

    // Resiliencia ante cold start de Render: 2 intentos con 25s de timeout cada uno
    const maxAttempts = 2;
    const timeoutMs = 25000;
    let result: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Ejecutando ping a ${targetUrl} (intento ${attempt}/${maxAttempts})...`);
        const res = await fetchWithTimeout(targetUrl, { method: 'POST', headers }, timeoutMs);

        // Render en cold boot suele responder 502, 503 o 504 mientras arranca el contenedor
        if ([502, 503, 504].includes(res.status) && attempt < maxAttempts) {
          console.warn(`Intento ${attempt} devolvió HTTP ${res.status} (posible cold start de Render). Reintentando en 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        result = res;
        break;
      } catch (err: any) {
        lastError = err;
        const isAbort = err?.name === 'AbortError' || err?.message?.includes('aborted');
        console.warn(`Intento ${attempt} falló: ${err?.message || err} (abortado por timeout: ${isAbort})`);
        if (attempt < maxAttempts) {
          console.log('Esperando 2s antes de reintentar tras despertar instancia de Render...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    if (!result) {
      throw lastError || new Error('No se pudo obtener respuesta del backend tras reintentar.');
    }

    if (!result.ok) {
      const text = await result.text();
      throw new Error(`Backend devolvió error ${result.status}: ${text}`);
    }

    const data = await result.json();

    return response.status(200).json({ 
      success: true, 
      message: 'Notificaciones procesadas exitosamente',
      window: windowParam || 'all',
      backend_response: data 
    });
  } catch (error) {
    console.error('Error al procesar el cron:', error);
    return response.status(500).json({ success: false, error: String(error) });
  }
}
