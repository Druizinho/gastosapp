import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9500); // Timeout de 9.5s para no exceder los 10s de Vercel

    const params = new URLSearchParams();
    if (cronSecret) params.set('token', cronSecret);
    if (windowParam) params.set('window', windowParam);
    const queryString = params.toString();
    const targetUrl = `${apiUrl}/push/cron${queryString ? `?${queryString}` : ''}`;

    const result = await fetch(targetUrl, {
      method: 'POST',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

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
