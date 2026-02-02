// Helper function to preserve UTM parameters
function getUTMParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = [];
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    utmKeys.forEach(key => {
        if (urlParams.has(key)) {
            utmParams.push(key + '=' + encodeURIComponent(urlParams.get(key)));
        }
    });
    return utmParams.length > 0 ? '&' + utmParams.join('&') : '';
}
