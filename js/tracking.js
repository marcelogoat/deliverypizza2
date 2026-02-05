
(function () {
    // Generate or retrieve anonymous ID
    let anonymousId = localStorage.getItem('analytics_anon_id');
    if (!anonymousId) {
        anonymousId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('analytics_anon_id', anonymousId);
    }

    function detectPage() {
        const path = window.location.pathname;

        // Checkout
        if (path.includes('custom_checkout') || document.querySelector('#checkout-page')) {
            return 'checkout';
        }

        // Flavors / Product
        if (path.includes('/produtos/pizza/') || document.querySelector('.adicionarProduto')) {
            return 'flavors';
        }

        // Main / Home
        return 'home';
    }

    function sendHeartbeat() {
        const page = detectPage();

        fetch('/api/analytics/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                anonymousId: anonymousId,
                page: page
            })
        }).catch(err => {
            // Silently fail on heartbeat errors
            // console.warn('Analytics heartbeat failed', err);
        });
    }

    // Send immediately on load
    sendHeartbeat();

    // Send every 5 seconds
    setInterval(sendHeartbeat, 5000);

    // Send "leave" signal on visibility hidden or unload
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            // Optional: Send a 'leave' endpoint call or just let it timeout. 
            // For simplicity and performance, letting it timeout with the shorter 10s window is often safer than beaconing on mobile.
            // However, to satisfy "immediate" request, we can try to send a quick expiring heartbeat or a specialized leave.
            // Let's rely on the faster timeout first, as beaconing can be unreliable or blocked.
        }
    });
})();
