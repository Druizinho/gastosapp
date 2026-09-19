import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Opcional: verificar que la petición viene de Vercel Cron
  // const authHeader = request.headers.authorization;
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return response.status(401).json({ success: false, error: 'Unauthorized' });
  // }

  try {
    // Tomar la URL del backend desde las variables de entorno de Vercel
    const backendUrl = process.env.VITE_API_URL;
    if (!backendUrl) {
      throw new Error('VITE_API_URL is not defined');
    }
    
    const apiUrl = backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`;
    
    // Llamar al endpoint del backend en Render que procesa las notificaciones
    console.log(`Llamando al backend en: ${apiUrl}/push/trigger`);
    const result = await fetch(`${apiUrl}/push/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

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
