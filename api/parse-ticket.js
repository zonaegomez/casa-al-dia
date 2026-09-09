// /api/parse-ticket.js
// Función serverless de Vercel (Node.js, sin dependencias externas).
// Recibe la foto de un ticket de compra (en base64) y usa la API de Claude
// (Anthropic) para extraer los conceptos y precios en formato JSON.
//
// Requiere una variable de entorno en el proyecto de Vercel:
//   ANTHROPIC_API_KEY = tu API key de https://console.anthropic.com
// (Vercel → tu proyecto → Settings → Environment Variables). La key nunca
// se expone al navegador: solo vive en este archivo, que corre en el
// servidor de Vercel.
//
// Si tu API key NO está asociada a un workspace específico (algunas keys de
// organización requieren esto), agrega también:
//   ANTHROPIC_WORKSPACE_ID = el ID del workspace (Anthropic Console → Settings → Workspaces)
// Si no lo necesitas, simplemente no la configures.

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // rápido y económico, ideal para leer tickets

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const imageBase64 = body && body.imageBase64;
  const mediaType = (body && body.mediaType) || 'image/jpeg';

  if (!imageBase64) {
    res.status(400).json({ error: 'Falta la imagen del ticket.' });
    return;
  }

  const prompt = `Analiza esta foto de un ticket de compra (supermercado o tienda, en México). Devuelve SOLO un JSON válido, sin texto adicional antes ni después, con esta forma exacta:
{"lines":[{"name":"nombre del producto","price":00.00}],"total":00.00}

Reglas:
- "name": nombre corto y legible del producto (sin códigos de barra, SKU ni abreviaturas raras).
- "price": el precio de esa línea en pesos mexicanos, como número (sin símbolo de moneda ni comas).
- "total": el total pagado del ticket si es visible; si no, la suma de las líneas.
- Ignora encabezados, descuentos globales, IVA desglosado, folios, RFC, formas de pago y cualquier línea que no sea un producto comprado.
- Si la foto no es legible o no logras identificar productos con confianza, responde {"lines":[],"total":0}.`;

  try {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    if (process.env.ANTHROPIC_WORKSPACE_ID) {
      headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    }
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: 'El servicio de IA no pudo procesar la foto.', detail: errText.slice(0, 400) });
      return;
    }

    const data = await anthropicRes.json();
    const textBlock = Array.isArray(data.content) ? data.content.find(c => c.type === 'text') : null;
    let parsed = { lines: [], total: 0 };

    if (textBlock && textBlock.text) {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const candidate = JSON.parse(match[0]);
          if (candidate && Array.isArray(candidate.lines)) {
            parsed = {
              lines: candidate.lines
                .filter(l => l && l.name)
                .map(l => ({ name: String(l.name).slice(0, 120), price: Number(l.price) || 0 })),
              total: Number(candidate.total) || 0
            };
          }
        } catch (e) {
          // deja parsed en su valor por defecto si el JSON no es válido
        }
      }
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Error interno al leer el ticket.', detail: String((e && e.message) || e) });
  }
}
