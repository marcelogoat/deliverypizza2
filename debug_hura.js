const fetch = require('node-fetch');

const HURA_PUBLIC_KEY = 'hurapay_live_2X1Pa1P85h7ngFx0EcIQlyWGPtPBb4Sz';
const HURA_SECRET_KEY = 'sk_live_PDrjYQJt6Z2IbnJV9yGEnYykQ7cg8Bs4';
const HURA_BASE_URL = 'https://api.hurapayments.com.br/v1';

function getHuraAuth() {
    return 'Basic ' + Buffer.from(`${HURA_PUBLIC_KEY}:${HURA_SECRET_KEY}`).toString('base64');
}

async function run() {
    try {
        const payload = {
            amount: 1000,
            payment_method: "pix",
            postback_url: "https://www.pizzadodiia.shop/api/webhook/hurapay",
            customer: {
                name: "Teste Integração",
                email: "teste@email.com.br",
                phone: "11999999999",
                document: {
                    number: "12345678909",
                    type: "cpf"
                }
            },
            metadata: {
                order_id: Date.now().toString()
            }
        };

        console.log('Sending request to Hura Pay...');
        const response = await fetch(`${HURA_BASE_URL}/payment-transaction/create`, {
            method: 'POST',
            headers: {
                'Authorization': getHuraAuth(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('Full Response:', JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
