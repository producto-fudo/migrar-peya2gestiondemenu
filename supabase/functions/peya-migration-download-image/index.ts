// Descarga una imagen desde una URL externa del lado del servidor (evita el
// bloqueo de CORS que tendría el navegador al pedirla directo) y la devuelve
// tal cual, con su content-type original, para poder subirla a Fudo.
//
// Nota: esta función no tenía su código guardado en el repo (solo estaba
// desplegada en Supabase) — se reconstruyó a partir de cómo la llama
// fudo-api.ts (POST { url } → blob con content-type).

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { url } = await req.json();

        if (!url) {
            return new Response(
                JSON.stringify({ error: 'Missing required field: url' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const upstream = await fetch(url);

        if (!upstream.ok) {
            return new Response(
                JSON.stringify({ error: 'No se pudo descargar la imagen', upstream_status: upstream.status }),
                { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        const body = await upstream.arrayBuffer();

        return new Response(body, {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': contentType },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
