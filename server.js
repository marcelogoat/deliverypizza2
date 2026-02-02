require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

// ============================================
// MarchaPay API Endpoints
// ============================================

// POST /api/payment/create - Create Pix transaction
app.post('/api/payment/create', async (req, res) => {
    try {
        console.log('[API] Creating MarchaPay transaction...');

        const pubKey = process.env.MARCHAPAY_PUBLIC_KEY;
        const secKey = process.env.MARCHAPAY_SECRET_KEY;

        if (!pubKey || !secKey) {
            throw new Error('MarchaPay credentials not configured');
        }

        // Create Basic Auth token
        const auth = Buffer.from(`${pubKey}:${secKey}`).toString('base64');

        const response = await fetch('https://api.marchabb.com/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[API] MarchaPay Error:', data);
            return res.status(response.status).json(data);
        }

        console.log('[API] Transaction created:', data.id);
        res.json(data);

    } catch (error) {
        console.error('[API] Error creating transaction:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// GET /api/payment/status/:transactionId - Get transaction status
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;
        console.log('[API] Checking transaction status:', transactionId);

        const pubKey = process.env.MARCHAPAY_PUBLIC_KEY;
        const secKey = process.env.MARCHAPAY_SECRET_KEY;

        if (!pubKey || !secKey) {
            throw new Error('MarchaPay credentials not configured');
        }

        const auth = Buffer.from(`${pubKey}:${secKey}`).toString('base64');

        const response = await fetch(`https://api.marchabb.com/v1/transactions/${transactionId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[API] MarchaPay Status Error:', data);
            return res.status(response.status).json(data);
        }

        console.log('[API] Transaction status:', data.status);
        res.json(data);

    } catch (error) {
        console.error('[API] Error checking status:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// ============================================
// Utmify API Endpoint
// ============================================

// POST /api/utmify/order - Send order to Utmify
app.post('/api/utmify/order', async (req, res) => {
    try {
        console.log('[API] Sending order to Utmify...');

        const utmifyToken = process.env.UTMIFY_API_TOKEN;
        if (!utmifyToken) {
            throw new Error('Utmify token not configured');
        }

        const response = await fetch('https://api.utmify.com.br/api-credentials/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-token': utmifyToken
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[API] Utmify Error:', data);
            return res.status(response.status).json(data);
        }

        console.log('[API] Utmify order sent successfully');
        res.json(data);

    } catch (error) {
        console.error('[API] Error sending to Utmify:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// ============================================
// Health Check
// ============================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        apis: {
            marchapay: !!(process.env.MARCHAPAY_PUBLIC_KEY && process.env.MARCHAPAY_SECRET_KEY),
            utmify: !!process.env.UTMIFY_API_TOKEN
        }
    });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🔒 API Keys loaded: MarchaPay=${!!(process.env.MARCHAPAY_PUBLIC_KEY && process.env.MARCHAPAY_SECRET_KEY)}, Utmify=${!!process.env.UTMIFY_API_TOKEN}\n`);
});
