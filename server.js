require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'receipts');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for receipts
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// COMPROVANTES: Rota Prioritária de Upload
// ============================================
app.post(['/api/orders/:transactionId/receipt', '/api/order/:transactionId/receipt'], upload.single('receipt'), (req, res) => {
    const transactionId = req.params.transactionId;
    console.log(`\n[DEBUG] Requisição de upload recebida!`);
    console.log(`[DEBUG] Transaction ID: ${transactionId}`);

    try {
        if (!req.file) {
            console.error('[API] Upload failed: No file selected');
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const orders = readOrders();
        const orderIdx = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        if (orderIdx === -1) {
            console.error(`[API] Upload failed: Order ${transactionId} not found`);
            return res.status(404).json({ error: `Pedido ${transactionId} não encontrado.` });
        }

        const receiptUrl = `/uploads/receipts/${req.file.filename}`;
        orders[orderIdx].receiptUrl = receiptUrl;
        writeOrders(orders);

        console.log(`[API] SUCCESS: Comprovante salvo: ${receiptUrl}`);
        res.json({ success: true, receiptUrl: receiptUrl });
    } catch (error) {
        console.error('[API] ERROR:', error);
        res.status(500).json({ error: 'Erro ao processar arquivo.', details: error.message });
    }
});

// Root redirect
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Custom Admin Routes
app.get('/index.html/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/index.html/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// ============================================
// Data Management & Helper Functions
// ============================================

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
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

function readSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (err) { console.error('Error reading settings:', err); }
    return { gateways: { active: 'hurapay' } };
}

function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (err) { console.error('Error writing settings:', err); }
}

// ============================================
// Gateway API Configuration
// ============================================

const HURA_BASE_URL = 'https://api.hurapayments.com.br/v1';
const BLACKOUT_BASE_URL = 'https://api.blackoutpaybr.com/v1/payment';

function getHuraAuth() {
    return 'Basic ' + Buffer.from(`${process.env.HURA_PUBLIC_KEY}:${process.env.HURA_SECRET_KEY}`).toString('base64');
}

function getBlackoutAuth() {
    return `Bearer ${process.env.BLACKOUT_API_KEY}`;
}

// ============================================
// Payment APIs
// ============================================

app.post('/api/payment/create', async (req, res) => {
    try {
        const { amount, customer, items, trackingParameters, paymentMethod } = req.body;
        const settings = readSettings();
        const activeGateway = settings.gateways?.active || 'hurapay';
        const huraSettings = settings.gateways?.hurapay || {};
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const localTransactionId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 1. Handle Delivery Payment
        if (paymentMethod === 'delivery') {
            const order = {
                transactionId: localTransactionId,
                amount: amount,
                paymentMethod: 'delivery',
                status: 'waiting_payment',
                customer: customer,
                items: items,
                deliveryData: req.body.deliveryData,
                trackingParameters: trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: []
            };
            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);
            return res.json({ success: true, id: localTransactionId, status: 'waiting_payment' });
        }

        // 2. Handle Hura Pay
        if (activeGateway === 'hurapay') {
            const order = {
                transactionId: localTransactionId,
                huraId: null,
                amount: amount,
                paymentMethod: 'pix',
                status: 'created',
                customer: customer,
                items: items,
                trackingParameters: trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: []
            };
            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);

            const payload = {
                amount: amount,
                payment_method: "pix",
                external_id: localTransactionId,
                metadata: { local_id: localTransactionId },
                postback_url: huraSettings.webhookUrl || "https://www.pizzapromododia.shop/api/webhook/hurapay",
                customer: {
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone,
                    document: { number: customer.document.number, type: "cpf" }
                }
            };

            const response = await fetch(`${HURA_BASE_URL}/payment-transaction/create`, {
                method: 'POST',
                headers: { 'Authorization': getHuraAuth(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) return res.status(response.status).json(data);

            const responseData = data.data || data;
            const pixCode = responseData.pix?.qr_code || responseData.pix?.qrcode || responseData.pix_code || responseData.qrcode;
            const txId = responseData.id || responseData.transaction_id;

            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].huraId = txId;
                    currentOrders[idx].status = 'waiting_payment';
                    writeOrders(currentOrders);
                    // Webhook handles Utmify report for Hura Pay
                }
            })();

            return res.json({ id: localTransactionId, huraId: txId, pix: { qrcode: pixCode } });
        }

        // 3. Handle Blackout Pay
        if (activeGateway === 'blackout') {
            const order = {
                transactionId: localTransactionId,
                amount: amount,
                paymentMethod: 'pix',
                status: 'created',
                customer: customer,
                items: items,
                trackingParameters: trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: []
            };
            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);

            const payload = {
                amount: amount,
                currency: "BRL",
                method: "PIX",
                description: `Pedido ${localTransactionId}`,
                externalRef: localTransactionId,
                notificationUrl: settings.gateways?.blackout?.webhookUrl || "https://www.pizzapromododia.shop/api/webhook/blackout",
                payer: {
                    name: customer.name,
                    taxId: customer.document.number.replace(/\D/g, ''),
                    email: customer.email,
                    phone: customer.phone.replace(/\D/g, '')
                }
            };

            const response = await fetch(BLACKOUT_BASE_URL, {
                method: 'POST',
                headers: { 'Authorization': getBlackoutAuth(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) return res.status(response.status).json(data);

            const pixCode = data.data?.copypaste;
            const blackoutId = data.data?.id;

            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].huraId = blackoutId;
                    currentOrders[idx].status = 'waiting_payment';
                    writeOrders(currentOrders);
                    await sendToUtmify(currentOrders[idx]);
                }
            })();

            return res.json({ id: localTransactionId, blackoutId: blackoutId, pix: { qrcode: pixCode } });
        }

    } catch (error) {
        console.error('[API] Error creating payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/payment/status/:transactionId
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;
        const orders = readOrders();
        const order = orders.find(o => String(o.transactionId) === String(transactionId));
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const settings = readSettings();
        const huraSettings = settings.gateways?.hurapay || {};

        const response = await fetch(`${HURA_BASE_URL}/payment-transaction/${order.huraId || transactionId}`, {
            method: 'GET',
            headers: { 'Authorization': getHuraAuth(), 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        let status = 'pending';
        const huraStatus = (data.status || '').toLowerCase();
        if (['paid', 'approved', 'completed', 'succeeded'].includes(huraStatus)) status = 'paid';
        else if (['refused', 'cancelled', 'failed'].includes(huraStatus)) status = 'refused';

        res.json({ status: status, original: data });
    } catch (error) {
        res.status(500).json({ error: 'Status check failed' });
    }
});

// ============================================
// Webhooks
// ============================================

app.post('/api/webhook/hurapay', (req, res) => {
    const notification = req.body;
    res.json({ success: true }); // Respond immediately

    (async () => {
        try {
            const huraId = notification.Id;
            const huraStatus = (notification.Status || '').toUpperCase();
            if (huraStatus !== 'PAID' && huraStatus !== 'PENDING') return;

            const mappedStatus = huraStatus === 'PAID' ? 'paid' : 'waiting_payment';
            
            let orders = readOrders();
            let orderIndex = orders.findIndex(o => String(o.huraId) === String(huraId) || String(o.transactionId) === String(notification.ExternalId));

            if (orderIndex !== -1) {
                if (orders[orderIndex].status !== mappedStatus) {
                    orders[orderIndex].status = mappedStatus;
                    writeOrders(orders);
                    await sendToUtmify(orders[orderIndex]);
                }
            }
        } catch (err) { console.error('[Webhook] Error:', err); }
    })();
});

// ============================================
// Utmify Integration
// ============================================

async function sendToUtmify(order) {
    const utmifyToken = process.env.UTMIFY_API_TOKEN;
    if (!utmifyToken) return;

    if (!order.reportedStatuses) order.reportedStatuses = [];
    if (order.reportedStatuses.includes(order.status)) return;

    try {
        const nameMap = {
            "2 Pizza PP + 1 Refrigerante 2 Litros": "Guia Seca Barriga Iniciante",
            "2 Pizza P + 1 Refrigerante 2 Litros": "Protocolo Detox 7 Dias",
            "2 Pizza M + 1 Refrigerante 2 Litros": "Método Emagrecimento Acelerado",
            "2 Pizza G + 1 Refrigerante 2 Litros": "Treinamento Queima de Gordura VIP",
            "2 Pizza Gigante + 1 Refrigerante 2 Litros": "MINI CURSO 30 DIAS",
            "5 Brownies": "Planilha de Treino em Casa",
            "10 Mini Churros": "Kit Suplementação Slim",
            "3 morangos do amor": "E-book Receitas Fitness"
        };

        const payload = {
            orderId: order.transactionId,
            platform: "Custom Store",
            paymentMethod: order.paymentMethod || "pix",
            status: order.status,
            createdAt: order.createdAt,
            approvedDate: order.status === 'paid' ? new Date().toISOString() : null,
            amount: Number(order.amount) || 0,
            customer: {
                name: order.customer.name,
                email: order.customer.email,
                phone: order.customer.phone,
                document: typeof order.customer.document === 'object' ? order.customer.document.number : order.customer.document,
                ip: order.clientIp || "127.0.0.1"
            },
            products: (order.items || []).map(item => {
                const apiName = nameMap[item.title] || item.title;
                return {
                    id: apiName,
                    name: apiName,
                    priceInCents: Math.round(item.unitPrice),
                    quantity: item.quantity
                };
            }),
            commission: { totalPriceInCents: Number(order.amount) || 0, gatewayFeeInCents: 0, userCommissionInCents: Number(order.amount) || 0 },
            trackingParameters: order.trackingParameters || {}
        };

        const response = await fetch('https://api.utmify.com.br/api-credentials/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-token': utmifyToken.trim() },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const allOrders = readOrders();
            const oIdx = allOrders.findIndex(o => o.transactionId === order.transactionId);
            if (oIdx !== -1) {
                if (!allOrders[oIdx].reportedStatuses) allOrders[oIdx].reportedStatuses = [];
                allOrders[oIdx].reportedStatuses.push(order.status);
                writeOrders(allOrders);
            }
        }
    } catch (err) { console.error('[Utmify] Error:', err); }
}

// ============================================
// Admin & Products API
// ============================================

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

app.get('/api/orders', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const orders = readOrders();
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
});

app.post('/api/orders/:transactionId/approve', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const { transactionId } = req.params;
    const orders = readOrders();
    const idx = orders.findIndex(o => String(o.transactionId) === String(transactionId));
    if (idx !== -1) {
        orders[idx].status = 'paid';
        writeOrders(orders);
        sendToUtmify(orders[idx]);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Order not found' });
    }
});

app.delete('/api/orders/:transactionId', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const { transactionId } = req.params;
    const orders = readOrders();
    const filtered = orders.filter(o => String(o.transactionId) !== String(transactionId));
    writeOrders(filtered);
    res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
    res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    writeSettings({ ...readSettings(), ...req.body });
    res.json({ success: true });
});

// ============================================
// Start
// ============================================

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
});
