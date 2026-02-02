/**
 * Global UTM Preservation Script
 * Ensures UTM parameters are preserved across all site navigation
 */

(function () {
    'use strict';

    // Get all UTM parameters from current URL
    function getUTMParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmParams = {};
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

        utmKeys.forEach(key => {
            if (urlParams.has(key)) {
                utmParams[key] = urlParams.get(key);
            }
        });

        return utmParams;
    }

    // Store UTMs in sessionStorage for persistence
    function storeUTMs() {
        const currentUTMs = getUTMParams();

        // If we have UTMs in the URL, store them
        if (Object.keys(currentUTMs).length > 0) {
            sessionStorage.setItem('utmParams', JSON.stringify(currentUTMs));
        }
    }

    // Get stored UTMs from sessionStorage
    function getStoredUTMs() {
        const stored = sessionStorage.getItem('utmParams');
        return stored ? JSON.parse(stored) : {};
    }

    // Convert UTM object to query string
    function utmsToQueryString(utms) {
        const params = [];
        for (const [key, value] of Object.entries(utms)) {
            params.push(`${key}=${encodeURIComponent(value)}`);
        }
        return params.length > 0 ? params.join('&') : '';
    }

    // Add UTMs to a URL
    function addUTMsToURL(url) {
        const utms = getStoredUTMs();
        if (Object.keys(utms).length === 0) return url;

        const utmString = utmsToQueryString(utms);
        const separator = url.includes('?') ? '&' : '?';

        return url + separator + utmString;
    }

    // Initialize: Store UTMs on page load
    storeUTMs();

    // Append UTMs to current URL if not present
    const currentUTMs = getUTMParams();
    const storedUTMs = getStoredUTMs();

    // If we have stored UTMs but not in current URL, add them
    if (Object.keys(storedUTMs).length > 0 && Object.keys(currentUTMs).length === 0) {
        const newURL = addUTMsToURL(window.location.href);
        if (newURL !== window.location.href) {
            window.history.replaceState({}, '', newURL);
        }
    }

    // Intercept all link clicks and add UTMs
    document.addEventListener('click', function (e) {
        let target = e.target;

        // Find the closest anchor tag
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
        }

        if (target && target.tagName === 'A' && target.href) {
            const url = new URL(target.href, window.location.origin);

            // Only modify internal links
            if (url.origin === window.location.origin) {
                const utms = getStoredUTMs();

                if (Object.keys(utms).length > 0) {
                    // Add UTMs to the link
                    for (const [key, value] of Object.entries(utms)) {
                        if (!url.searchParams.has(key)) {
                            url.searchParams.set(key, value);
                        }
                    }

                    target.href = url.toString();
                }
            }
        }
    }, true); // Use capture phase to catch before other handlers

    // Expose global function for manual redirects
    window.addUTMsToURL = addUTMsToURL;
    window.getStoredUTMs = getStoredUTMs;

})();
