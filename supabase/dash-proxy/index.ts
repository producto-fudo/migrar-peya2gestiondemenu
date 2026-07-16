const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { accountId, dashCookie } = await req.json();

        if (!accountId || !dashCookie) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: accountId, dashCookie' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const url = `https://dash.fu.do/accounts/${accountId}/support_user`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                Cookie: dashCookie,
                'Content-Length': '0',
                Accept: 'application/json',
            },
        });

        const body = await response.text();

        if (!response.ok) {
            return new Response(
                JSON.stringify({ error: 'dash.fu.do request failed', upstream_status: response.status, upstream_body: body }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        return new Response(body, {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
