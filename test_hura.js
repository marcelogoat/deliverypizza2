const fetch = require('node-fetch');

const SK = 'sk_live_PDrjYQJt6Z2IbnJV9yGEnYykQ7cg8Bs4';
const PUBLIC = 'hurapay_live_2X1Pa1P85h7ngFx0EcIQlyWGPtPBb4Sz';

async function test(url) {
    console.log(`Testing ${url}...`);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SK}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Body: ${text.substring(0, 100)}`);
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

async function run() {
    await test('https://api.hurapayments.com/v1/payment/transaction');
    await test('https://api.hurapayments.com/api/v1/payment/transaction');
    await test('https://api.hurapay.com/v1/payment/transaction');
    await test('https://hurapayments.com/api/v1/payment/transaction');
}

run();
