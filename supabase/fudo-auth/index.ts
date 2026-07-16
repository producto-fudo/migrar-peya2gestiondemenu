// fudo-auth: autentica contra Fudo con email + contraseña usando el endpoint
// público auth.fu.do/authenticate (mismo flujo que la app oficial de Fudo).
// Devuelve la respuesta cruda de Fudo (token + clusters) al cliente.

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AuthBody {
    email?: string;
    login?: string;
    password?: string;
    env?: "production" | "staging";
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Método no permitido" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    try {
        const body = (await req.json().catch(() => ({}))) as AuthBody;
        const login = (body.email ?? body.login ?? "").trim();
        const password = body.password ?? "";

        if (!login || !password) {
            return new Response(
                JSON.stringify({ error: "Email y contraseña son requeridos" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                },
            );
        }

        const isStaging = body.env === "staging";
        const authBaseUrl = isStaging ? "https://auth.staging.fu.do" : "https://auth.fu.do";
        const appBaseUrl = isStaging ? "https://app-v2.staging.fu.do" : "https://app-v2.fu.do";

        const upstream = await fetch(`${authBaseUrl}/authenticate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/plain, */*",
                Origin: appBaseUrl,
                Referer: `${appBaseUrl}/`,
            },
            body: JSON.stringify({ login, password }),
        });

        const text = await upstream.text();

        if (!upstream.ok) {
            console.error("Fudo auth error", {
                status: upstream.status,
                body: text.slice(0, 500),
            });

            let parsedMessage = "Credenciales inválidas";
            try {
                const parsed = JSON.parse(text) as {
                    errors?: Array<{ detail?: string; code?: string; title?: string }>;
                };
                const detail =
                    parsed.errors?.[0]?.detail ||
                    parsed.errors?.[0]?.title ||
                    parsed.errors?.[0]?.code;
                if (detail) parsedMessage = detail;
            } catch {
                // ignore parse errors, use default message
            }

            return new Response(
                JSON.stringify({
                    error: parsedMessage,
                    upstream_status: upstream.status,
                    upstream_body: text,
                }),
                {
                    status: upstream.status,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                },
            );
        }

        return new Response(text, {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        console.error("fudo-auth runtime error", message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
