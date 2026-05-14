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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Added to handle form-encoded webhooks

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'receipts');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration
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
// middleware is now defined above to ensure order

// Request logging for debugging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
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

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Custom Admin Routes
app.get('/index.html/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/index.html/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// ============================================
// Admin Configuration & Helper Functions
// ============================================

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

function readSettings() {
    try {
        const SETTINGS_FILE = path.join(__dirname, 'settings.json');
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (err) { console.error('Error reading settings:', err); }
    return { gateways: { active: 'hurapay' } };
}

// ============================================
// Hura Pay API Endpoints
// ============================================

// HuraPay Keys from environment variables
const HURA_PUBLIC_KEY = process.env.HURA_PUBLIC_KEY;
const HURA_SECRET_KEY = process.env.HURA_SECRET_KEY;
const HURA_BASE_URL = 'https://api.hurapayments.com.br/v1';

const BLACKOUT_API_KEY = process.env.BLACKOUT_API_KEY;
const BLACKOUT_BASE_URL = 'https://api.blackoutpaybr.com/v1/payment';

const GHOSTSPAY_BASE_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';

// ============================================
// Paradise Pag Config
// ============================================
const PARADISE_API_KEY = 'sk_9743cb5f3daa665f2d812e5326c2b10ed69517ea9111d7e60a67206de3b736f3';
const PARADISE_STORE_ID = 8221;
const PARADISE_BASE_URL = 'https://multi.paradisepags.com/api/v1';

// Gerador de CPF válido
function gerarCPF() {
    const n = () => Math.floor(Math.random() * 9);
    let d = [n(),n(),n(),n(),n(),n(),n(),n(),n()];
    let s1 = d.reduce((acc, v, i) => acc + v * (10 - i), 0);
    let r1 = (s1 * 10) % 11; if (r1 >= 10) r1 = 0;
    d.push(r1);
    let s2 = d.reduce((acc, v, i) => acc + v * (11 - i), 0);
    let r2 = (s2 * 10) % 11; if (r2 >= 10) r2 = 0;
    d.push(r2);
    return d.join('');
}

// Gera email sem acento a partir do nome
function gerarEmail(nome) {
    const normalizado = nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-zA-Z0-9 ]/g, '')  // remove caracteres especiais
        .trim()
        .toLowerCase()
        .split(' ')
        .filter(Boolean);

    const dominios = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br', 'icloud.com'];
    const dominio = dominios[Math.floor(Math.random() * dominios.length)];
    const sufixo = Math.floor(Math.random() * 900) + 100;

    if (normalizado.length >= 2) {
        return `${normalizado[0]}.${normalizado[normalizado.length - 1]}${sufixo}@${dominio}`;
    }
    return `${(normalizado[0] || 'cliente')}${sufixo}@${dominio}`;
}

// Helper for Hura Pay Auth
function getHuraAuth() {
    return 'Basic ' + Buffer.from(`${HURA_PUBLIC_KEY}:${HURA_SECRET_KEY}`).toString('base64');
}

// Helper fetch with timeout to prevent infinite hangs
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs / 1000}s. The gateway may be unavailable.`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Helper for Blackout Pay Auth
function getBlackoutAuth() {
    return `Bearer ${process.env.BLACKOUT_API_KEY}`;
}

// Helper for GhostsPay Auth
function getGhostspayAuth(secretKey, companyId) {
    const sk = secretKey || process.env.GHOSTSPAY_SECRET_KEY;
    const cid = companyId || process.env.GHOSTSPAY_COMPANY_ID;
    return 'Basic ' + Buffer.from(`${sk}:${cid}`).toString('base64');
}

// POST /api/payment/create - Create Pix transaction (Hura Pay)
app.post('/api/payment/create', async (req, res) => {
    try {
        console.log('[API] Creating Hura Pay transaction...');

        // Map frontend payload to Hura Pay format
        const { amount, customer, items, trackingParameters, paymentMethod } = req.body;
        console.log(`[API] Create Payment - Method: ${paymentMethod}, Amount: ${amount}, Customer: ${customer?.name}`);
        console.log(`[API] Items received from frontend:`, JSON.stringify(items));
        console.log(`[API] Items count:`, Array.isArray(items) ? items.length : 'NOT AN ARRAY');

        const settings = readSettings();
        const activeGateway = settings.gateways?.active || 'hurapay';
        const huraSettings = settings.gateways?.hurapay || {};

        // Capture client IP for Utmify
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

        // Generate a unique transaction ID
        const localTransactionId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Handle Delivery Payment (No Gateway)
        if (req.body.paymentMethod === 'delivery') {
            const order = {
                transactionId: localTransactionId,
                huraId: null,
                amount: req.body.amount,
                paymentMethod: 'delivery',
                status: 'waiting_payment', // Deliveries are always waiting until approved in admin
                customer: req.body.customer,
                items: req.body.items,
                deliveryData: req.body.deliveryData,
                trackingParameters: req.body.trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: [],
                isRetryFee: req.body.originalTransactionId ? true : false,
                originalTransactionId: req.body.originalTransactionId || null
            };

            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);

            console.log(`[API] Delivery Order SAVED: ${localTransactionId}`);
            return res.json({
                success: true,
                id: localTransactionId,
                status: 'waiting_payment'
            });
        }
        
        if (activeGateway === 'hurapay') {
            console.log(`[API] Using Hura Pay Gateway...`);
            
            const order = {
                transactionId: localTransactionId,
                huraId: null,
                amount: amount,
                paymentMethod: 'pix',
                gateway: 'hurapay',
                status: 'created',
                customer: customer,
                items: items,
                trackingParameters: trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: [],
                isRetryFee: req.body.originalTransactionId ? true : false,
                originalTransactionId: req.body.originalTransactionId || null
            };
            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);

            // Build items for HuraPay - simplified to single item for robustness as per user request
            // Using a single item ensures the total matches the transaction amount and prevents "0.00" display issues.
            // Build items for HuraPay - accurately mirroring the working "gerador_manual" example
            const huraItems = [{
                title: 'serviço digital',
                name: 'serviço digital', // Redundant field
                unit_price: Math.floor(amount),
                price: Math.floor(amount), // Redundant field
                quantity: 1
            }];

            const protocol = req.protocol;
            const host = req.get('host');
            const baseUrl = `${protocol}://${host}`;
            
            const payload = {
                amount: Math.floor(amount),
                payment_method: "pix",
                external_id: localTransactionId,
                metadata: { 
                    Source: 'gerador_manual', 
                    provider_name: 'serviço digital',
                    local_id: localTransactionId, 
                    order_id: localTransactionId
                },
                postback_url: `${baseUrl}/api/webhook/hurapay`,
                customer: {
                    name: customer.name,
                    email: customer.email || 'customer@gmail.com',
                    phone: customer.phone,
                    document: { number: customer.document.number || customer.document, type: "cpf" }
                },
                items: huraItems,
                pix: { expires_in_days: 1 }
            };
            console.log('[API] HuraPay payload:', JSON.stringify(payload, null, 2));

            console.log('[API] Calling HuraPay API...');
            const response = await fetchWithTimeout(`${HURA_BASE_URL}/payment-transaction/create`, {
                method: 'POST',
                headers: {
                    'Authorization': getHuraAuth(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }, 30000);

            let data = {};
            const rawText = await response.text();
            console.log('[API] HuraPay raw response status:', response.status);
            console.log('[API] HuraPay raw response body:', rawText.substring(0, 500));
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                console.error('[API] HuraPay response is NOT valid JSON. Raw:', rawText.substring(0, 300));
                return res.status(500).json({ 
                    error: 'Payment creation failed', 
                    message: `Hura Pay retornou resposta inválida (status ${response.status})`,
                    details: rawText.substring(0, 300)
                });
            }

            if (!response.ok) {
                console.error('[API] Hura Pay Error Status:', response.status);
                console.error('[API] Hura Pay Error Data:', JSON.stringify(data, null, 2));
                return res.status(response.status).json({ 
                    error: 'Payment creation failed', 
                    message: data.message || 'Hura Pay API error',
                    details: data 
                });
            }

            const responseData = data.data || data;
            const pixCode = (responseData.pix && responseData.pix.qr_code) || (responseData.pix && responseData.pix.qrcode) || responseData.pix_code || responseData.qrcode;
            const txId = data.id || (data.data && data.data.id) || responseData.id || responseData.transaction_id;
            const checkoutUrl = responseData.checkout_url || responseData.payment_url || responseData.checkoutUrl || (responseData.pix && responseData.pix.payment_url);

            // Update in background
            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].huraId = txId;
                    currentOrders[idx].status = 'waiting_payment';
                    currentOrders[idx].checkoutUrl = checkoutUrl;
                    writeOrders(currentOrders);
                    await sendToUtmify(currentOrders[idx]);
                }
            })();

            return res.json({
                success: true,
                id: localTransactionId,
                huraId: txId,
                pix: { qrcode: pixCode }
            });

        } else if (activeGateway === 'blackout') {
            console.log(`[API] Using Blackout Pay Gateway...`);

            const order = {
                transactionId: localTransactionId,
                amount: amount,
                paymentMethod: 'pix',
                gateway: 'blackout',
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
                amount: amount, // Em centavos
                currency: "BRL",
                method: "PIX",
                description: `Serviço Digital ${localTransactionId}`,
                externalRef: localTransactionId,
                notificationUrl: settings.gateways?.blackout?.webhookUrl || "https://www.superpromopizza.shop/api/webhook/blackout",
                payer: {
                    name: customer.name,
                    taxId: customer.document.number.replace(/\D/g, ''), // Somente números
                    email: customer.email,
                    phone: customer.phone.replace(/\D/g, '')
                }
            };

            const response = await fetch(BLACKOUT_BASE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': getBlackoutAuth(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[API] Blackout Error:', data);
                return res.status(response.status).json({ error: 'Blackout Payment failed', details: data });
            }

            // A documentação indica que o código Pix está em data.copypaste
            const pixCode = data.data?.copypaste;
            const blackoutId = data.data?.id;

            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].huraId = blackoutId; // Usamos huraId genericamente para o ID externo
                    currentOrders[idx].status = 'waiting_payment';
                    writeOrders(currentOrders);
                    await sendToUtmify(currentOrders[idx]);
                }
            })();

            return res.json({
                id: localTransactionId,
                blackoutId: blackoutId,
                pix: { qrcode: pixCode }
            });

        } else if (activeGateway === 'ghostspay') {
            const gsSettings = settings.gateways?.ghostspay || {};
            const secretKey = gsSettings.secretKey || process.env.GHOSTSPAY_SECRET_KEY;
            const companyId = gsSettings.companyId || process.env.GHOSTSPAY_COMPANY_ID;

            const order = {
                transactionId: localTransactionId,
                amount: amount,
                paymentMethod: 'pix',
                gateway: 'ghostspay',
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
                paymentMethod: "PIX",
                customer: {
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone.replace(/\D/g, ''),
                    document: {
                        number: customer.document.number.replace(/\D/g, ''),
                        type: "CPF"
                    }
                },
                items: items.map(item => ({
                    title: item.title,
                    unitPrice: item.unitPrice,
                    quantity: item.quantity
                })),
                pix: { expiresInDays: 1 },
                postbackUrl: gsSettings.webhookUrl || "https://www.superpromopizza.shop/api/webhook/ghostspay"
            };

            console.log('[API] Calling GhostsPay API...');
            const response = await fetchWithTimeout(GHOSTSPAY_BASE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': getGhostspayAuth(secretKey, companyId),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }, 30000);

            const responseText = await response.text();
            let data = {};
            try {
                data = JSON.parse(responseText);
            } catch (err) {
                console.error('[API] GhostsPay Error parsing JSON:', responseText);
                return res.status(response.status).json({ 
                    error: 'GhostsPay API Error', 
                    message: 'Erro ao processar resposta do servidor',
                    details: responseText 
                });
            }

            if (!response.ok) {
                console.error('[API] GhostsPay Error Status:', response.status);
                console.error('[API] GhostsPay Error Data:', JSON.stringify(data, null, 2));
                return res.status(response.status).json({ 
                    error: 'GhostsPay Payment failed', 
                    message: data.message || 'GhostsPay API error',
                    details: data 
                });
            }

            const pixCode = data.pix?.qrcode || data.pix?.qrCode || data.qrcode;
            const gsId = data.id;

            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].huraId = gsId;
                    currentOrders[idx].status = 'waiting_payment';
                    writeOrders(currentOrders);
                    console.log(`[API] GHOSTSPAY: Pix generated. Status updated locally. Utmify skipped per user request.`);
                }
            })();

            return res.json({
                id: localTransactionId,
                ghostspayId: gsId,
                pix: { qrcode: pixCode }
            });

        } else if (activeGateway === 'paradisepag') {
            console.log(`[API] Using Paradise Pag Gateway...`);

            // Gerar CPF e email automaticamente (checkout só coleta nome e telefone)
            const cpfGerado = gerarCPF();
            const emailGerado = gerarEmail(customer.name);
            const telefoneFormatado = (customer.phone || '').replace(/\D/g, '');

            const finalCustomer = {
                ...req.body.customer,
                email: emailGerado,
                phone: telefoneFormatado,
                document: {
                    type: 'cpf',
                    number: cpfGerado
                }
            };

            const order = {
                transactionId: localTransactionId,
                paradiseId: null,
                amount: amount,
                paymentMethod: 'pix',
                gateway: 'paradisepag',
                status: 'created',
                customer: finalCustomer,
                items: items,
                deliveryData: req.body.deliveryData,
                trackingParameters: trackingParameters,
                clientIp: clientIp,
                createdAt: new Date().toISOString(),
                reportedStatuses: [],
                isRetryFee: req.body.originalTransactionId ? true : false,
                originalTransactionId: req.body.originalTransactionId || null
            };
            const orders = readOrders();
            orders.push(order);
            writeOrders(orders);

            const protocol = req.protocol;
            const host = req.get('host');
            const baseUrl = `${protocol}://${host}`;

            const paradisePayload = {
                amount: Math.floor(amount),
                description: 'servico digital',
                reference: localTransactionId,
                source: 'api_externa',
                postback_url: "https://www.superpizzas.shop/api/webhook/paradisepag",
                customer: {
                    name: customer.name,
                    email: emailGerado,
                    phone: telefoneFormatado,
                    document: cpfGerado
                }
            };

            console.log('[API] Paradise Pag payload:', JSON.stringify(paradisePayload, null, 2));

            const paradiseResponse = await fetchWithTimeout(`${PARADISE_BASE_URL}/transaction.php`, {
                method: 'POST',
                headers: {
                    'X-API-Key': PARADISE_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(paradisePayload)
            }, 30000);

            const rawText = await paradiseResponse.text();
            console.log('[API] Paradise Pag raw status:', paradiseResponse.status);
            console.log('[API] Paradise Pag raw body:', rawText.substring(0, 500));

            let paradiseData = {};
            try {
                paradiseData = JSON.parse(rawText);
            } catch (e) {
                console.error('[API] Paradise Pag response is NOT valid JSON:', rawText.substring(0, 300));
                return res.status(500).json({
                    error: 'Payment creation failed',
                    message: `Paradise Pag retornou resposta inválida (status ${paradiseResponse.status})`,
                    details: rawText.substring(0, 300)
                });
            }

            if (!paradiseResponse.ok || paradiseData.status !== 'success') {
                console.error('[API] Paradise Pag Error:', JSON.stringify(paradiseData, null, 2));
                return res.status(paradiseResponse.status || 400).json({
                    error: 'Payment creation failed',
                    message: paradiseData.message || 'Paradise Pag API error',
                    details: paradiseData
                });
            }

            const pixCode = paradiseData.qr_code;
            const pixBase64 = paradiseData.qr_code_base64;
            const paradiseId = paradiseData.transaction_id;

            // Atualiza pedido em background
            (async () => {
                const currentOrders = readOrders();
                const idx = currentOrders.findIndex(o => o.transactionId === localTransactionId);
                if (idx !== -1) {
                    currentOrders[idx].paradiseId = paradiseId;
                    currentOrders[idx].status = 'waiting_payment';
                    writeOrders(currentOrders);
                    await sendToUtmify(currentOrders[idx]);
                }
            })();

            return res.json({
                success: true,
                id: localTransactionId,
                paradiseId: paradiseId,
                pix: { qrcode: pixCode, qrcode_base64: pixBase64 }
            });

        } else {
            // Placeholder for unknown gateway
            console.error(`[API] External Gateway '${activeGateway}' unknown.`);
            return res.status(501).json({ error: 'Gateway unknown' });
        }

    } catch (error) {
        console.error('[API] Error creating transaction:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// GET /api/payment/status/:transactionId - Get transaction status
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;
        
        // 1. Check local database first (it may have manual status updates from admin)
        const orders = readOrders();
        const localOrder = orders.find(o => String(o.transactionId) === String(transactionId));
        
        if (localOrder) {
            // Priority to local status if it was manually updated beyond 'pending/waiting'
            if (['paid', 'preparing', 'shipping'].includes(localOrder.status)) {
                return res.json({ status: localOrder.status, id: transactionId });
            }
        }

        // 2. If locally still waiting, check gateway
        const settings = readSettings();
        const activeGateway = localOrder?.gateway || settings.gateways?.active || 'hurapay';

        // --- Paradise Pag Status Check ---
        if (activeGateway === 'paradisepag') {
            const paradiseId = localOrder?.paradiseId;
            if (paradiseId) {
                try {
                    const response = await fetchWithTimeout(
                        `${PARADISE_BASE_URL}/query.php?action=get_transaction&id=${paradiseId}`,
                        { method: 'GET', headers: { 'X-API-Key': PARADISE_API_KEY } },
                        15000
                    );
                    if (response.ok) {
                        const data = await response.json();
                        const pStatus = (data.status || '').toLowerCase();
                        if (pStatus === 'approved') {
                            if (localOrder && localOrder.status !== 'paid') {
                                const updatedOrders = readOrders();
                                const idx = updatedOrders.findIndex(o => String(o.transactionId) === String(transactionId));
                                if (idx !== -1) {
                                    updatedOrders[idx].status = 'paid';
                                    writeOrders(updatedOrders);
                                    startStatusAutomation(transactionId);
                                    await sendToUtmify(updatedOrders[idx]);
                                }
                            }
                            return res.json({ status: 'paid' });
                        } else if (['failed', 'refunded', 'chargeback'].includes(pStatus)) {
                            return res.json({ status: 'refused' });
                        }
                    }
                } catch (err) {
                    console.error('[API] Paradise Pag Status Check Error:', err.message);
                }
            }
            const finalStatus = localOrder?.status === 'created' ? 'waiting_payment' : (localOrder?.status || 'waiting_payment');
            return res.json({ status: finalStatus });
        }
        
        // --- Hura Pay Status Check ---
        if (activeGateway === 'hurapay') {
            const huraSettings = settings.gateways?.hurapay || {};
            const targetId = localOrder?.huraId || transactionId;

            try {
                const response = await fetch(`${HURA_BASE_URL}/payment-transaction/${targetId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': getHuraAuth(huraSettings.publicKey, huraSettings.secretKey),
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    let status = 'pending';
                    const huraStatus = (data.status || '').toLowerCase();

                    if (['paid', 'approved', 'completed', 'succeeded'].includes(huraStatus)) {
                        status = 'paid';
                        if (localOrder && localOrder.status !== 'paid') {
                            const updatedOrders = readOrders();
                            const idx = updatedOrders.findIndex(o => String(o.transactionId) === String(transactionId));
                            if (idx !== -1) {
                                updatedOrders[idx].status = 'paid';
                                writeOrders(updatedOrders);
                                await sendToUtmify(updatedOrders[idx]);
                            }
                        }
                    } else if (['refused', 'cancelled', 'failed'].includes(huraStatus)) {
                        status = 'refused';
                    }
                    
                    return res.json({ status: status, original: data });
                }
            } catch (err) {
                console.error('[API] Hura Pay Status Check Error:', err);
            }
        }

        // Return local status if everything else fails
        let finalStatus = localOrder?.status || 'waiting_payment';
        if (finalStatus === 'pending' || finalStatus === 'created') finalStatus = 'waiting_payment';
        
        console.log(`[API] STATUS POLL: ${transactionId} -> ${finalStatus}`);
        res.json({ status: finalStatus });

    } catch (error) {
        console.error('[API] Error checking status:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// POST /api/webhook/paradisepag - Paradise Pag Webhook Listener
app.post('/api/webhook/paradisepag', (req, res) => {
    // Paradise Pag can send data in the body or as form parameters
    const notification = req.body;
    
    // Log the entire payload for debugging
    console.log(`\n[Webhook] PARADISE PAG RAW PAYLOAD:`, JSON.stringify(notification, null, 2));

    const paradiseStatus = (notification.status || '').toLowerCase();
    const externalId = notification.external_id || notification.reference;
    const paradiseId = notification.transaction_id;

    console.log(`[Webhook] PARADISE PAG PROCESSED: TxId=${paradiseId}, ExtId=${externalId}, Status=${paradiseStatus}`);

    // Respond immediately
    res.json({ success: true });

    (async () => {
        try {
            // We consider 'approved' or 'paid' as successful
            const isPaid = ['approved', 'paid', 'completed', 'succeeded'].includes(paradiseStatus);
            if (!isPaid) {
                console.log(`[Webhook] PARADISE PAG: Status ${paradiseStatus} not handled as success.`);
                return;
            }

            let orders = [];
            let orderIndex = -1;

            // Retry finding the order for 10 seconds
            for (let attempt = 1; attempt <= 10; attempt++) {
                orders = readOrders();
                orderIndex = orders.findIndex(o =>
                    (externalId && String(o.transactionId) === String(externalId)) ||
                    (paradiseId && String(o.paradiseId) === String(paradiseId))
                );
                if (orderIndex !== -1) break;
                if (attempt < 10) await new Promise(r => setTimeout(r, 1000));
            }

            if (orderIndex !== -1) {
                const order = orders[orderIndex];
                if (order.status !== 'paid') {
                    console.log(`[Webhook] PARADISE PAG: ${order.status} -> paid for ${order.transactionId}`);
                    
                    orders[orderIndex].status = 'paid';
                    orders[orderIndex].updatedAt = new Date().toISOString();
                    writeOrders(orders);
                    
                    // START AUTOMATION (Paid -> Prep -> Ship -> Fail)
                    startStatusAutomation(order.transactionId);
                    
                    // RESCUE FLOW: If this was a retry fee, revert original order
                    if (order.originalTransactionId) {
                        console.log(`[Webhook] PARADISE PAG: RETRY FEE PAID! Reverting order ${order.originalTransactionId} to shipping.`);
                        const origIdx = orders.findIndex(o => String(o.transactionId) === String(order.originalTransactionId));
                        if (origIdx !== -1) {
                            orders[origIdx].status = 'shipping';
                            writeOrders(orders);
                        }
                    }

                    await sendToUtmify(orders[orderIndex]);
                }
            } else {
                console.warn(`[Webhook] PARADISE PAG: NOT FOUND - TxId=${paradiseId}, ExtId=${externalId}`);
            }
        } catch (err) {
            console.error('[Webhook] Paradise Pag Background Error:', err);
        }
    })();
});

// POST /api/webhook/hurapay - Hura Pay Webhook Listener
app.post('/api/webhook/hurapay', (req, res) => {
    const settings = readSettings();
    if (settings.huraWebhookEnabled === false) {
        console.log('[Webhook] Hura Pay is DISABLED in settings. Ignoring notification.');
        return res.json({ success: false, message: 'Webhook disabled' });
    }

    const notification = req.body;
    console.log(`[Webhook] RECEIVED: HuraId=${notification.Id}, Status=${notification.Status}`);

    // RESPOND IMMEDIATELY TO HURA PAY
    res.json({ success: true });

    (async () => {
        try {
            const huraId = notification.Id;
            const externalId = notification.ExternalId;
            const metadata = notification.Metadata || {};
            const huraStatus = (notification.Status || '').toUpperCase();

            // Try to extract our ID from any possible location in Hura's payload
            const ourIdCandidate = externalId || metadata.local_id || metadata.order_id;

            if (huraStatus !== 'PAID' && huraStatus !== 'PENDING') {
                return;
            }

            const mappedStatus = huraStatus === 'PAID' ? 'paid' : 'waiting_payment';

            let orders = [];
            let orderIndex = -1;

            // Retry for 10 seconds in the background (very safe)
            for (let attempt = 1; attempt <= 10; attempt++) {
                orders = readOrders();
                orderIndex = orders.findIndex(o =>
                    (ourIdCandidate && String(o.transactionId) === String(ourIdCandidate)) ||
                    (huraId && String(o.huraId) === String(huraId)) ||
                    (huraId && String(o.transactionId) === String(huraId))
                );

                if (orderIndex !== -1) break;

                if (attempt < 10) {
                    // console.log(`[Webhook] ${huraId} not found, retrying in 1s (${attempt}/10)...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (orderIndex !== -1) {
                const order = orders[orderIndex];
                if (order.status !== mappedStatus) {
                    console.log(`[Webhook] REPORTING: ${order.status} -> ${mappedStatus} for ${order.transactionId}`);

                    // Update DB
                    orders[orderIndex].status = mappedStatus;
                    writeOrders(orders);

                    if (mappedStatus === 'paid') {
                        // AUTOMATIC CONFIRMATION
                        orders[orderIndex].status = 'paid';
                        orders[orderIndex].updatedAt = new Date().toISOString();
                        
                        console.log(`[Webhook] Order ${orders[orderIndex].transactionId} CONFIRMED AUTOMATICALLY.`);
                        
                        // Start the 6-second automation timer (Paid -> Prep -> Ship -> Fail)
                        startStatusAutomation(orders[orderIndex].transactionId);
                        
                        // RESCUE FLOW: If this was a retry fee, revert original order
                        const metadata = req.body.metadata || {};
                        if (metadata.originalTransactionId) {
                            console.log(`[Webhook] RETRY FEE PAID! Reverting order ${metadata.originalTransactionId} to shipping.`);
                            const origIdx = orders.findIndex(o => String(o.transactionId) === String(metadata.originalTransactionId));
                            if (origIdx !== -1) {
                                orders[origIdx].status = 'shipping';
                                // We don't restart automation here, just leave it at shipping per user request
                            }
                        }
                    }

                    // SEND TO UTMIFY (WEBHOOK-ONLY TRIGGER)
                    await sendToUtmify(orders[orderIndex]);
                }
            } else {
                console.warn(`[Webhook] NOT FOUND: HuraId=${huraId}, ExternalId=${externalId}. Metadata:`, JSON.stringify(metadata));
            }
        } catch (err) {
            console.error('[Webhook] Background processing error:', err);
        }
    })();
});

// POST /api/webhook/blackout - Blackout Pay Webhook Listener
app.post('/api/webhook/blackout', (req, res) => {
    const settings = readSettings();
    if (settings.blackoutWebhookEnabled === false) {
        console.log('[Webhook] Blackout Pay is DISABLED in settings. Ignoring notification.');
        return res.json({ success: false, message: 'Webhook disabled' });
    }

    const notification = req.body;
    const externalId = notification.externalRef || notification.external_ref || notification.externalId;
    const blackoutStatus = (notification.status || notification.event || '').toLowerCase();

    console.log(`[Webhook] BLACKOUT RECEIVED: ExtId=${externalId}, Status=${blackoutStatus}`);

    // Respond to Blackout
    res.json({ success: true });

    if (!externalId) return;

    (async () => {
        try {
            // Map Blackout status (Assuming 'paid' or 'confirmed' means payment successful)
            const isPaid = ['paid', 'confirmed', 'completed', 'approved', 'succeeded'].includes(blackoutStatus);
            const mappedStatus = isPaid ? 'paid' : 'waiting_payment';

            const orders = readOrders();
            const orderIndex = orders.findIndex(o => String(o.transactionId) === String(externalId));

            if (orderIndex !== -1) {
                const order = orders[orderIndex];
                if (order.status !== mappedStatus) {
                    console.log(`[Webhook] BLACKOUT REPORTING: ${order.status} -> ${mappedStatus} for ${order.transactionId}`);
                    orders[orderIndex].status = mappedStatus;
                    writeOrders(orders);
                    
                    if (mappedStatus === 'paid') {
                        startStatusAutomation(order.transactionId);
                    }
                    
                    await sendToUtmify(orders[orderIndex]);
                }
            }
        } catch (err) {
            console.error('[Webhook] Blackout Background Error:', err);
        }
    })();
});

// POST /api/webhook/ghostspay - GhostsPay Webhook Listener
app.post('/api/webhook/ghostspay', (req, res) => {
    const settings = readSettings();
    if (settings.ghostspayWebhookEnabled === false) {
        console.log('[Webhook] GhostsPay is DISABLED in settings. Ignoring notification.');
        return res.json({ success: false, message: 'Webhook disabled' });
    }

    const { data } = req.body;
    const gsId = data?.id;
    const gsStatus = (data?.status || '').toLowerCase();

    console.log(`[Webhook] GHOSTSPAY RECEIVED: GsId=${gsId}, Status=${gsStatus}`);

    // Respond to GhostsPay
    res.json({ success: true });

    if (!gsId) return;

    (async () => {
        try {
            const isPaid = ['paid', 'confirmed', 'succeeded'].includes(gsStatus);
            if (!isPaid) return; // Só processamos se for pago

            const mappedStatus = 'paid';
            const orders = readOrders();
            
            // Na GhostsPay, buscamos pelo huraId (onde salvamos o ID da transação deles)
            const orderIndex = orders.findIndex(o => String(o.huraId) === String(gsId));

            if (orderIndex !== -1) {
                const order = orders[orderIndex];
                if (order.status !== mappedStatus) {
                    console.log(`[Webhook] GHOSTSPAY ADMIN UPDATE: ${order.status} -> ${mappedStatus} for ${order.transactionId}`);
                    
                    orders[orderIndex].status = mappedStatus;
                    writeOrders(orders);
                    
                    // Automation Step (6s)
                    startStatusAutomation(order.transactionId);
                    
                    // REMOVIDO: sendToUtmify (já integrado direto no gateway)
                    console.log(`[Webhook] GHOSTSPAY: Status updated in Admin Panel. Utmify skipped per user request.`);
                }
            }
        } catch (err) {
            console.error('[Webhook] GhostsPay Background Error:', err);
        }
    })();
});



// Helper to map Hura Pay status (kept for compatibility if needed elsewhere)
function mapHuraPayStatus(mpStatus) {
    const status = String(mpStatus).toLowerCase();
    if (['paid', 'approved', 'completed', 'succeeded'].includes(status)) return 'paid';
    if (['refused', 'cancelled', 'failed'].includes(status)) return 'refused';
    return 'pending';
}

// Reusable Utmify Reporting Function
async function sendToUtmify(order) {
    const settings = readSettings();

    // WEBHOOK TOGGLE CHECK: Stop Utmify if the gateway toggle is OFF
    if (order.paymentMethod === 'pix') {
        // Determinamos o gateway: ou pela flag explícita ou pelo contexto do pedido
        const effectiveGateway = order.gateway || (order.huraId ? 'hurapay' : settings.gateways?.active);

        if (effectiveGateway === 'hurapay' && settings.huraWebhookEnabled === false) {
            console.log(`[Utmify] BLOCKED: Hura Pay reporting is disabled (Manual or Auto).`);
            return;
        }
        if (effectiveGateway === 'blackout' && settings.blackoutWebhookEnabled === false) {
            console.log(`[Utmify] BLOCKED: Blackout Pay reporting is disabled.`);
            return;
        }
        if (effectiveGateway === 'ghostspay' && settings.ghostspayWebhookEnabled === false) {
            console.log(`[Utmify] BLOCKED: GhostsPay reporting is disabled.`);
            return;
        }
    }

    const utmifyToken = process.env.UTMIFY_API_TOKEN;
    if (!utmifyToken) {
        console.warn('[Utmify] ERROR: TOKEN NOT CONFIGURED IN ENVIRONMENT VARIABLES!');
        return;
    }

    // DUPLICATE PREVENTION: Don't send the same status twice for the same order
    if (!order.reportedStatuses) order.reportedStatuses = [];
    if (order.reportedStatuses.includes(order.status)) {
        console.log(`[Utmify] Status ${order.status} already reported for ${order.transactionId}. Skipping.`);
        return;
    }

    try {
        const amountValue = Number(order.amount) || 0;
        console.log('[Utmify] Preparing report for:', order.transactionId, 'Status:', order.status, 'Amount:', amountValue);

        const nameMap = {
            "2 Pizza PP + 1 Refrigerante 2 Litros": "Guia Seca Barriga Iniciante",
            "2 Pizza P + 1 Refrigerante 2 Litros": "Protocolo Detox 7 Dias",
            "2 Pizza M + 1 Refrigerante 2 Litros": "Método Emagrecimento Acelerado",
            "2 Pizza G + 1 Refrigerante 2 Litros": "Treinamento Queima de Gordura VIP",
            "2 Pizza Gigante + 1 Refrigerante 2 Litros": "MINI CURSO 30 DIAS",
            "2 Pizza Gigante + 2 Refrigerante 2 Litros": "MINI CURSO 30 DIAS",
            "5 Brownies": "Planilha de Treino em Casa",
            "10 Mini Churros": "Kit Suplementação Slim",
            "3 morangos do amor": "E-book Receitas Fitness"
        };

        const payload = {
            orderId: order.transactionId,
            platform: "Custom Store",
            paymentMethod: order.paymentMethod || "pix",
            status: order.status || "waiting_payment",
            createdAt: order.createdAt,
            approvedDate: order.status === 'paid' ? new Date().toISOString() : null,
            amount: amountValue,
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
                    planId: apiName,
                    planName: apiName,
                    priceInCents: Math.round(item.unitPrice),
                    quantity: item.quantity
                };
            }),
            commission: {
                totalPriceInCents: amountValue,
                gatewayFeeInCents: 0,
                userCommissionInCents: amountValue
            },
            trackingParameters: order.trackingParameters || {}
        };

        // LOG FULL PAYLOAD TO DEBUG 0 VALUE ISSUE
        console.log('[Utmify] Sending Payload:', JSON.stringify(payload));

        const response = await fetch('https://api.utmify.com.br/api-credentials/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-token': utmifyToken.trim()
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error(`[Utmify] API Error (HTTP ${response.status}):`, JSON.stringify(data, null, 2));
        } else {
            console.log('[Utmify] SUCCESS: Report sent to Utmify for', order.transactionId);

            // SAVE REPORTED STATUS TO PREVENT DUPLICATES
            try {
                const allOrders = readOrders();
                const oIdx = allOrders.findIndex(o => o.transactionId === order.transactionId);
                if (oIdx !== -1) {
                    if (!allOrders[oIdx].reportedStatuses) allOrders[oIdx].reportedStatuses = [];
                    allOrders[oIdx].reportedStatuses.push(order.status);
                    writeOrders(allOrders);
                }
            } catch (saveErr) { console.error('[Utmify] Error saving reported status:', saveErr); }
        }
    } catch (err) {
        console.error('[Utmify] NETWORK ERROR:', err.message);
    }
}

app.post('/api/orders/:transactionId/approve', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.substring(7);
    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    try {
        const { transactionId } = req.params;
        const orders = readOrders();
        const orderIndex = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        if (orderIndex === -1) {
            return res.status(404).json({ error: 'Pedido não encontrado' });
        }

        if (orders[orderIndex].status === 'paid') {
            // Allow override if already paid
        }

        orders[orderIndex].status = 'paid';
        writeOrders(orders);

        // Notify Utmify
        await sendToUtmify(orders[orderIndex]);

        // Automation Step (6s)
        startStatusAutomation(transactionId);

        console.log(`[Admin] Order ${transactionId} manually approved.`);
        res.json({ success: true, status: 'paid' });

    } catch (error) {
        console.error('[Admin] Error approving order:', error);
        res.status(500).json({ error: 'Failed to approve order' });
    }
});

// Update Order Status (Manually by Admin/Kitchen)
app.post('/api/orders/:transactionId/status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.substring(7);
    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    try {
        const { transactionId } = req.params;
        const { status } = req.body;

        const allowedStatuses = ['waiting_payment', 'paid', 'preparing', 'shipping'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const orders = readOrders();
        const orderIndex = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        if (orderIndex === -1) {
            return res.status(404).json({ error: 'Pedido não encontrado' });
        }

        console.log(`[Admin] Order ${transactionId} status updated: ${orders[orderIndex].status} -> ${status}`);
        
        orders[orderIndex].status = status;
        writeOrders(orders);

        res.json({ success: true, status: status });

    } catch (error) {
        console.error('[Admin] Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});


app.post('/api/orders/:transactionId/sync', async (req, res) => {
    try {
        const { transactionId } = req.params;
        console.log('[API] Syncing transaction status:', transactionId);

        let targetId = transactionId;
        const ordersForLookup = readOrders();
        const localOrder = ordersForLookup.find(o => String(o.transactionId) === String(transactionId));

        // If it's our local ID, use the stored Hura ID for the API call
        if (localOrder && localOrder.huraId) {
            targetId = localOrder.huraId;
        }

        const settings = readSettings();
        const huraSettings = settings.gateways?.hurapay || {};

        const response = await fetch(`${HURA_BASE_URL}/payment-transaction/${targetId}`, {
            method: 'GET',
            headers: { 'Authorization': getHuraAuth(huraSettings.publicKey, huraSettings.secretKey), 'Content-Type': 'application/json' }
        });

        const textBody = await response.text();
        let data;
        try {
            data = JSON.parse(textBody);
        } catch (je) {
            console.error('[API] Invalid JSON from Hura Sync:', textBody);
            return res.status(500).json({ error: 'Invalid response from Hura Pay', body: textBody });
        }

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const newStatus = mapHuraPayStatus(data.status);

        // Update local order
        const orders = readOrders();
        const orderIndex = orders.findIndex(o => String(o.transactionId) === String(transactionId));

        let updated = false;
        if (orderIndex !== -1) {
            if (orders[orderIndex].status !== newStatus) {
                console.log(`[Sync] Updating status for ${transactionId}: ${orders[orderIndex].status} -> ${newStatus}`);
                orders[orderIndex].status = newStatus;
                writeOrders(orders);
                updated = true;

                if (newStatus === 'paid') {
                    startStatusAutomation(transactionId);
                }

                // TRIGGER UTMIFY
                await sendToUtmify(orders[orderIndex]);
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
            console.error('[API] Utmify API Error:', data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('[API] Utmify Proxy Error:', error);
        res.status(500).json({ error: 'Failed to send to Utmify' });
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
            utmify: !!process.env.UTMIFY_API_TOKEN
        }
    });
});


// ============================================
// Admin API
// ============================================


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
    return {};
}

function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (err) { console.error('Error writing settings:', err); }
}

app.get('/api/public/settings', (req, res) => {
    const settings = readSettings();
    const publicSettings = {
        enableCreditCard: settings.enableCreditCard,
        labelPaymentDelivery: settings.labelPaymentDelivery,
        labelHouseNumber: settings.labelHouseNumber,
        labelDeliveryTime: settings.labelDeliveryTime,
        labelCash: settings.labelCash,
        labelCep: settings.labelCep,
        deliveryPaymentEnabled: settings.deliveryPaymentEnabled !== false,
        placeholderHouseNumber: settings.placeholderHouseNumber,
        placeholderDeliveryTime: settings.placeholderDeliveryTime,
        placeholderCash: settings.placeholderCash,
        placeholderCep: settings.placeholderCep,
        labelDeliverySection: settings.labelDeliverySection,
        popupTitle: settings.popupTitle,
        popupContent: settings.popupContent,
        popupButton: settings.popupButton
    };
    res.json(publicSettings);
});

app.get('/api/settings', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const currentSettings = readSettings();
        const newSettings = { ...currentSettings, ...req.body };
        writeSettings(newSettings);
        console.log('[API] Settings updated');
        res.json({ success: true, settings: newSettings });
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
// Products API (Dynamic Pricing)
// ============================================
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

function readProducts() {
    try {
        if (fs.existsSync(PRODUCTS_FILE)) {
            return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
        }
    } catch (err) { console.error('Error reading products:', err); }
    return [];
}

function writeProducts(products) {
    try {
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    } catch (err) { console.error('Error writing products:', err); }
}

app.get('/api/products', (req, res) => {
    res.json(readProducts());
});

// Status Automation Helper (Realistic tracking timeline)
function startStatusAutomation(transactionId) {
    if (!transactionId) return;
    
    // Step 1: Wait 2 minutes -> Preparing
    setTimeout(() => {
        try {
            const orders = readOrders();
            const idx = orders.findIndex(o => String(o.transactionId) === String(transactionId));
            if (idx !== -1) {
                // Pre-check: Don't downgrade status if manually changed
                if (orders[idx].status !== 'paid') return; 

                orders[idx].status = 'preparing';
                orders[idx].updatedAt = new Date().toISOString();
                writeOrders(orders);
                console.log(`[Automation] ${transactionId} -> preparing (2m mark)`);
                
                // Step 2: Wait another 20 minutes -> Shipping
                setTimeout(() => {
                    const latestOrders = readOrders();
                    const i = latestOrders.findIndex(o => String(o.transactionId) === String(transactionId));
                    if (i !== -1) {
                        if (latestOrders[i].status !== 'preparing') return;

                        latestOrders[i].status = 'shipping';
                        latestOrders[i].updatedAt = new Date().toISOString();
                        writeOrders(latestOrders);
                        console.log(`[Automation] ${transactionId} -> shipping (22m mark)`);
                        
                        // Step 3: Wait another 13 minutes -> Failed Delivery
                        setTimeout(() => {
                            const finalOrders = readOrders();
                            const fi = finalOrders.findIndex(o => String(o.transactionId) === String(transactionId));
                            if (fi !== -1) {
                                if (finalOrders[fi].status !== 'shipping') return;

                                finalOrders[fi].status = 'failed_delivery';
                                finalOrders[fi].updatedAt = new Date().toISOString();
                                writeOrders(finalOrders);
                                console.log(`[Automation] ${transactionId} -> failed_delivery (35m mark)`);
                            }
                        }, 13 * 60 * 1000); // 13 minutes
                    }
                }, 20 * 60 * 1000); // 20 minutes
            }
        } catch (err) { console.error('[Automation Error]:', err); }
    }, 2 * 60 * 1000); // 2 minutes
}

app.post('/api/products', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.substring(7);
    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    try {
        writeProducts(req.body);
        console.log('[API] Products updated');
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating products:', error);
        res.status(500).json({ error: 'Failed to update products' });
    }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🔒 API Keys loaded: HuraPay=${!!process.env.HURA_PUBLIC_KEY}, Utmify=${!!process.env.UTMIFY_API_TOKEN}, Blackout=${!!process.env.BLACKOUT_API_KEY}`);
    console.log(`📊 Analytics active\n`);
});
