require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

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

// Helper to map MarchaPay status to our status
function mapMarchaPayStatus(mpStatus) {
    const status = String(mpStatus).toLowerCase();
    if (['paid', 'approved', 'completed'].includes(status)) return 'paid';
    if (['refused', 'cancelled', 'failed'].includes(status)) return 'refused';
    return 'pending';
}

app.post('/api/orders/:transactionId/sync', async (req, res) => {
    try {
        const { transactionId } = req.params;
        console.log('[API] Syncing transaction status:', transactionId);

        const pubKey = process.env.MARCHAPAY_PUBLIC_KEY;
        const secKey = process.env.MARCHAPAY_SECRET_KEY;

        if (!pubKey || !secKey) {
            return res.status(500).json({ error: 'MarchaPay credentials not configured' });
        }

        const auth = Buffer.from(`${pubKey}:${secKey}`).toString('base64');
        const response = await fetch(`https://api.marchabb.com/v1/transactions/${transactionId}`, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const newStatus = mapMarchaPayStatus(data.status);

        // Update local order
        const orders = readOrders();
        const orderIndex = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        let updated = false;
        if (orderIndex !== -1) {
            if (orders[orderIndex].status !== newStatus) {
                orders[orderIndex].status = newStatus;
                writeOrders(orders);
                updated = true;

                // TRIGGER UTMIFY IF PAID
                if (newStatus === 'paid') {
                    const order = orders[orderIndex];
                    try {
                        console.log('[API] Order paid! Sending to Utmify...', order.transactionId);
                        const utmifyToken = process.env.UTMIFY_API_TOKEN;

                        if (utmifyToken) {
                            // Reconstruct Utmify Payload
                            const payload = {
                                orderId: order.transactionId,
                                platform: "Custom Store",
                                paymentMethod: order.paymentMethod || "pix",
                                status: "paid",
                                createdAt: order.createdAt,
                                approvedDate: new Date().toISOString(),
                                amount: order.amount, // stored in cents in json? Yes.
                                customer: {
                                    name: order.customer.name,
                                    email: order.customer.email,
                                    phone: order.customer.phone,
                                    document: order.customer.document.number || order.customer.document,
                                    ip: "127.0.0.1"
                                },
                                products: order.items.map(item => {
                                    // Re-map names if needed (copy map from frontend or store mapped name? Stored items have 'title')
                                    // Ideally we use the title stored.
                                    return {
                                        id: item.title,
                                        name: item.title,
                                        planId: item.title,
                                        planName: item.title,
                                        priceInCents: item.unitPrice,
                                        quantity: item.quantity
                                    };
                                }),
                                trackingParameters: order.trackingParameters || {
                                    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null
                                },
                                commission: {
                                    totalPriceInCents: order.amount,
                                    gatewayFeeInCents: 0,
                                    userCommissionInCents: order.amount
                                }
                            };

                            fetch('https://api.utmify.com.br/api-credentials/orders', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-token': utmifyToken
                                },
                                body: JSON.stringify(payload)
                            })
                                .then(uRes => uRes.json())
                                .then(uData => console.log('[API] Utmify Update Response:', uData))
                                .catch(err => console.error('[API] Utmify Update Error:', err));
                        }
                    } catch (utmErr) {
                        console.error('Error triggering Utmify:', utmErr);
                    }
                }
            }
        }

        res.json({ success: true, status: newStatus, updated: updated, remoteData: data });

    } catch (error) {
        console.error('[API] Error syncing status:', error);
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
// Admin API
// ============================================

const fs = require('fs');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const ADMIN_TOKEN = 'admin123secret';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'pizza2024';

function readOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        }
    } catch (err) { console.error('Error reading orders:', err); }
    return [];
}

function writeOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    } catch (err) { console.error('Error writing orders:', err); }
}

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        const order = { ...req.body, createdAt: new Date().toISOString() };
        const orders = readOrders();
        orders.push(order);
        writeOrders(orders);
        res.json({ success: true, orderId: order.transactionId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/orders', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.substring(7);
    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Token inválido' });
    }
    try {
        const orders = readOrders();
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read orders' });
    }
});

app.post('/api/orders/:transactionId/copied', (req, res) => {
    try {
        const { transactionId } = req.params;
        const orders = readOrders();
        const orderIndex = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        if (orderIndex !== -1) {
            orders[orderIndex].pixCopied = true;
            writeOrders(orders);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// ============================================
// Delete Order Endpoint
// ============================================

app.delete('/api/orders/batch', (req, res) => {
    try {
        const { transactionIds } = req.body;
        if (!Array.isArray(transactionIds)) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        const orders = readOrders();
        const initialLength = orders.length;

        const newOrders = orders.filter(o => !transactionIds.includes(String(o.transactionId)));

        writeOrders(newOrders);
        res.json({ success: true, deletedCount: initialLength - newOrders.length });
    } catch (error) {
        console.error('Error batch deleting orders:', error);
        res.status(500).json({ error: 'Failed to batch delete orders' });
    }
});

app.delete('/api/orders/:transactionId', (req, res) => {
    try {
        const { transactionId } = req.params;
        const orders = readOrders();
        const initialLength = orders.length;

        const newOrders = orders.filter(o => String(o.transactionId) !== String(transactionId));

        if (newOrders.length < initialLength) {
            writeOrders(newOrders);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// ============================================
// Settings API (Dynamic Control)
// ============================================
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function readSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (err) { console.error('Error reading settings:', err); }
    // Default settings
    return { enableCreditCard: true };
}

function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (err) { console.error('Error writing settings:', err); }
}

app.get('/api/settings', (req, res) => {
    res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
    try {
        const { enableCreditCard } = req.body;
        const currentSettings = readSettings();

        // Update specific fields
        if (typeof enableCreditCard === 'boolean') {
            currentSettings.enableCreditCard = enableCreditCard;
        }

        writeSettings(currentSettings);
        console.log('[API] Settings updated:', currentSettings);
        res.json({ success: true, settings: currentSettings });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});


// ============================================
// Real-Time Analytics API
// ============================================

const activeUsers = {}; // { [anonymousId]: { page: 'home', lastSeen: Date.now() } }
const CLEANUP_INTERVAL = 5000; // Cleanup stale users every 5 seconds
const TIMEOUT_MS = 12000; // User considered offline after 12s (slightly > 2 heartbeats)

// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const userId in activeUsers) {
        if (now - activeUsers[userId].lastSeen > TIMEOUT_MS) {
            delete activeUsers[userId];
        }
    }
}, CLEANUP_INTERVAL);

app.post('/api/analytics/heartbeat', (req, res) => {
    try {
        const { anonymousId, page } = req.body;
        if (anonymousId && page) {
            activeUsers[anonymousId] = {
                page: page,
                lastSeen: Date.now()
            };
        }
        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(500);
    }
});

app.get('/api/analytics/online', (req, res) => {
    const now = Date.now();
    const stats = {
        total: 0,
        home: 0,
        flavors: 0,
        checkout: 0
    };

    for (const userId in activeUsers) {
        // Filter on read-time as well for accuracy
        if (now - activeUsers[userId].lastSeen <= TIMEOUT_MS) {
            stats.total++;
            const page = activeUsers[userId].page;
            if (stats[page] !== undefined) {
                stats[page]++;
            } else {
                // Determine category if not explicit
                // Simplify for dashboard mapping
                if (page === 'flavors') stats.flavors++;
                else if (page === 'checkout') stats.checkout++;
                else stats.home++;
            }
        } else {
            // Lazy delete
            delete activeUsers[userId];
        }
    }
    res.json(stats);
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🔒 API Keys loaded: MarchaPay=${!!(process.env.MARCHAPAY_PUBLIC_KEY && process.env.MARCHAPAY_SECRET_KEY)}, Utmify=${!!process.env.UTMIFY_API_TOKEN}`);
    console.log(`📊 Analytics active\n`);
});
