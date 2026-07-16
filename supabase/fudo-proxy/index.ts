const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function fudoBaseUrl(env?: string) {
    return env === 'staging' ? 'https://api.staging.fu.do' : 'https://api.fu.do';
}

function appBaseUrl(env?: string) {
    return env === 'staging' ? 'https://app-v2.staging.fu.do' : 'https://app-v2.fu.do';
}

type ProxyPayload = {
    path: string;
    method: string;
    token: string;
    clusterId?: string;
    env?: string;
    forwardBody?: BodyInit;
    contentType: string;
};

async function parseProxyPayload(req: Request): Promise<ProxyPayload> {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const url = new URL(req.url);
        return {
            path: url.searchParams.get('path') || '',
            method: (url.searchParams.get('method') || 'PUT').toUpperCase(),
            token: url.searchParams.get('token') || '',
            clusterId: url.searchParams.get('clusterId') || undefined,
            env: url.searchParams.get('env') || undefined,
            forwardBody: await req.arrayBuffer(),
            contentType,
        };
    }

    const json = await req.json();
    return {
        path: String(json.path || ''),
        method: String(json.method || 'GET').toUpperCase(),
        token: String(json.token || ''),
        clusterId: json.clusterId ? String(json.clusterId) : undefined,
        env: json.env ? String(json.env) : undefined,
        forwardBody: json.body ? JSON.stringify(json.body) : undefined,
        contentType,
    };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { path, method, token, clusterId, env, forwardBody, contentType } = await parseProxyPayload(req);

        if (!path || !token) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: path, token' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const normalizedPath = path.replace(/^\/+/, '');
        const fudoUrl = new URL(normalizedPath, `${fudoBaseUrl(env)}/`).toString();
        const app = appBaseUrl(env);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
        };

        if (clusterId) {
            headers['Fudo-Cluster-Id'] = clusterId;
        }

        // Browser-like headers to match what app-v2.fu.do sends
        headers['Accept'] = 'application/json, text/plain, */*';
        headers['Origin'] = app;
        headers['Referer'] = `${app}/app/`;
        headers['Fudo-Request-Id'] = crypto.randomUUID();

        const hasBody = method !== 'GET' && method !== 'HEAD' && forwardBody !== undefined;
        if (hasBody && contentType.includes('multipart/form-data')) {
            headers['Content-Type'] = contentType;
        } else if (hasBody) {
            headers['Content-Type'] = 'application/json';
        }

        const fudoResponse = await fetch(fudoUrl, {
            method,
            headers,
            body: hasBody ? forwardBody : undefined,
        });

        const responseBody = await fudoResponse.text();
        const responseContentType = fudoResponse.headers.get('content-type') || 'application/json';

        if (!fudoResponse.ok) {
            console.error('Fudo upstream error', {
                status: fudoResponse.status,
                url: fudoUrl,
                body: responseBody.slice(0, 600),
            });

            return new Response(
                JSON.stringify({
                    error: 'Fudo API request failed',
                    upstream_status: fudoResponse.status,
                    upstream_url: fudoUrl,
                    upstream_body: responseBody,
                }),
                { status: fudoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        return new Response(responseBody, {
            status: fudoResponse.status,
            headers: {
                ...corsHeaders,
                'Content-Type': responseContentType,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Proxy runtime error', message);

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});