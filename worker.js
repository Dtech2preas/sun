/**
 * 🚀 D-TECH GLOBAL ROUTER V5.2
 * LOCATION: Cloudflare Worker
 */

const VM_BASE_URL = "http://35.209.78.254"; 
const HARDCODED_SECRET = "dtech_super_secret_key_2025"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname; 

    // Parse Subdomain (Correctly handling .co.za)
    const ROOT_DOMAIN = "account-login.co.za";
    let subdomain = null;

    // If it's NOT the root domain, but ends with it, extract subdomain
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        // Remove .account-login.co.za from the end
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    // 1. INTERNAL API: MANAGE USERS
    if (url.pathname === '/api/worker/manage' && request.method === 'POST') {
      return handleApiRequest(request, env);
    }

    // 2. ROUTING LOGIC (User Traffic)
    if (!subdomain || subdomain === 'www') {
       // Fetch VM Home directly, explicitly setting Host header to IP to avoid 1003
       return fetch(VM_BASE_URL, {
         headers: { 'Host': '35.209.78.254' }
       });
    }

    // Lookup User in KV (Requires 'SUBDOMAINS' binding to KV 'DTECH_DB')
    const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

    if (!data) {
      return new Response(render404(subdomain), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    if (data.type === 'REDIRECT') return Response.redirect(data.target, 301);

    if (data.type === 'HTML') {
      try {
        // Fetch directly from IP, explicit Host header
        const vmResponse = await fetch(`${VM_BASE_URL}/storage/${subdomain}`, {
            headers: { 'Host': '35.209.78.254' }
        });

        if (vmResponse.status === 404) {
             return new Response("<h1>Site Not Found</h1>", { status: 404, headers: {'Content-Type': 'text/html'} });
        }

        if (vmResponse.status !== 200) {
             return new Response("<h1>Error: Hosting Node Offline</h1>", { status: 502, headers: {'Content-Type': 'text/html'} });
        }

        return new Response(vmResponse.body, { headers: { 'Content-Type': 'text/html' } });
      } catch (err) {
        return new Response("<h1>Error: Hosting Node Offline</h1>", { status: 503, headers: {'Content-Type': 'text/html'} });
      }
    }

    if (data.type === 'PROXY') {
      let targetUrl = data.target.endsWith('/') ? data.target.slice(0, -1) : data.target;
      const originalResponse = await fetch(targetUrl + url.pathname + url.search, {
        headers: { 'User-Agent': 'Mozilla/5.0 (D-TECH Cloud)' }
      });
      let response = new Response(originalResponse.body, { status: originalResponse.status, headers: originalResponse.headers });
      if (data.plan !== 'PRO') return new HTMLRewriter().on('body', new BannerInjector()).transform(response);
      return response;
    }

    return new Response("Configuration Error", { status: 500 });
  }
};

async function handleApiRequest(request, env) {
  const secret = request.headers.get('X-Auth');
  const API_KEY = env.API_SECRET || HARDCODED_SECRET; 
  if (secret !== API_KEY) return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401});

  const body = await request.json();
  const { action, subdomain, type, target, plan, html } = body;

  if (!subdomain) return new Response("Missing subdomain", {status: 400});
  if (action === 'DELETE') {
    await env.SUBDOMAINS.delete(subdomain);
    return new Response(JSON.stringify({status: "Deleted", subdomain}), {status: 200});
  }

  if (action === 'SET') {
    if (type === 'HTML' && html) {
      try {
        const vmResponse = await fetch(`${VM_BASE_URL}/api/create`, {
          method: "POST",
          headers: {
            "Host": "35.209.78.254", // Explicit Host Header
            "Content-Type": "application/json",
            "X-DTECH-SECRET": HARDCODED_SECRET,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" // Fake UA
          },
          body: JSON.stringify({ subdomain: subdomain, html: html })
        });

        if (vmResponse.status !== 200) {
           const errorText = await vmResponse.text();
           return new Response(JSON.stringify({ error: `VM Failed: ${vmResponse.status} - ${errorText}` }), {status: 500});
        }
      } catch (err) {
        return new Response(JSON.stringify({error: "VM Connection Failed: " + err.message}), {status: 500});
      }
    }
    const entry = { type: type || 'REDIRECT', target: target || '', plan: plan || 'FREE', created: Date.now() };
    await env.SUBDOMAINS.put(subdomain, JSON.stringify(entry));
    return new Response(JSON.stringify({status: "Active", data: entry}), {status: 200});
  }
  return new Response("Unknown Action", {status: 400});
}

class BannerInjector { element(element) { element.prepend(`<div style="background:#000;color:#fff;text-align:center;">🚀 Hosted by D-TECH Cloud</div>`, { html: true }); } }
function render404(subdomain) { return `<html><body style="text-align:center;"><h1>Subdomain Not Found</h1></body></html>`; }
