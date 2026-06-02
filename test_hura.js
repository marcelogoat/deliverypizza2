const fetch = require('node-fetch');

const SK = process.env.HURA_SECRET_KEY || '';
const PUBLIC = process.env.HURA_PUBLIC_KEY || '';

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
