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
    const backendUrl = process.env.BACKEND_API_URL || process.env.VITE_API_URL || 'http://localhost:8000/api';
    const apiUrl = backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`;
    
    console.log(`Disparando cron de notificaciones en: ${apiUrl}/push/cron`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500); // Timeout de 8.5s para no exceder los 10s de Vercel

    const targetUrl = `${apiUrl}/push/cron${cronSecret ? `?token=${encodeURIComponent(cronSecret)}` : ''}`;
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
      backend_response: data 
    });
  } catch (error) {
    console.error('Error al procesar el cron:', error);
    return response.status(500).json({ success: false, error: String(error) });
  }
}
