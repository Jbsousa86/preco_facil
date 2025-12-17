require('dotenv').config();
// server.js - Backend for Mercado 
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// Configuração de CORS
const whitelist = [
    'http://localhost:3000', 
    'http://127.0.0.1:5500', // Para desenvolvimento local com Live Server
    'https://preco-facil-vc5w.vercel.app', // Frontend em produção (Vercel)
];
if (process.env.FRONTEND_URL) {
    whitelist.push(process.env.FRONTEND_URL);
}

const corsOptions = {
    origin: function (origin, callback) {
        // Permitir requisições sem 'origin' (ex: Postman, apps mobile)
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','x-admin-key'],
    exposedHeaders: ['Content-Type','Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// Configuração do Multer para Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// PostgreSQL connection pool (adjust credentials as needed)
const connectionString = process.env.DATABASE_URL; // Tenta ler a string completa do Render

let config;

if (connectionString) {
  // Se estiver em ambiente de produção (Render), use a URI completa
  config = {
    connectionString: connectionString,
    // ESSENCIAL: O Render exige SSL para conexões
    ssl: {
      rejectUnauthorized: false 
    }
  };
} else {
  // Se não, use as variáveis separadas (para desenvolvimento local)
  config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  };
}

const pool = new Pool(config);

// Middleware de proteção administrativa
const requireAdminSecret = (req, res, next) => {
    // Lê a chave que você envia do Vercel
    const clientKey = req.headers['x-admin-key'];
    const serverKey = process.env.ADMIN_SECRET_KEY;

    // Se a chave bater com a do Render, libera o acesso
    if (clientKey && serverKey && clientKey === serverKey) {
        return next();
    }

    // Caso contrário, bloqueia e avisa no log o que aconteceu
    console.error(`Acesso negado: Recebi '${clientKey}', mas a chave configurada no Render é diferente.`);
    res.status(403).json({ error: 'Acesso negado. Chave de administrador inválida.' });
};

// --- Simple HMAC token helpers (lightweight JWT-like) ---
const TOKEN_TTL_SECONDS = 60 * 60; // 1 hora
function signAdminToken(payload) {
    const secret = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET_KEY || 'dev-secret';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Object.assign({}, payload, { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
    const payloadB = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payloadB}`).digest('base64url');
    return `${header}.${payloadB}.${signature}`;
}

function verifyAdminToken(token) {
    const secret = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET_KEY || 'dev-secret';
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Token inválido');
    const [headerB, payloadB, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${headerB}.${payloadB}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error('Assinatura inválida');
    const payload = JSON.parse(Buffer.from(payloadB, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expirado');
    return payload;
}

// FUNÇÃO PARA INICIALIZAR E GARANTIR A ESTRUTURA DO BANCO DE DADOS
async function initializeDatabase() {
    try {
        console.log("Iniciando a verificação e criação do esquema do banco de dados...");

        // --- 1. GARANTIR EXTENSÕES ---
        await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent;').catch(e => console.error('Erro ao criar extensão unaccent:', e.message));
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;').catch(e => console.error('Erro ao criar extensão pg_trgm:', e.message));

        // --- 2. CRIAR TABELAS BASE (SEM DEPENDÊNCIA DE FK) ---
        
        // 2.1 STORES (Necessário para PRICES)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stores (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                logo_url TEXT,
                rating NUMERIC(2, 1) DEFAULT 5.0,
                is_blocked BOOLEAN DEFAULT FALSE
            );
        `).catch(e => console.error('Erro ao criar tabela stores:', e.message));

        // 2.2 PRODUCTS (Necessário para PRICES)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `).catch(e => console.error('Erro ao criar tabela products:', e.message));

        // 2.3 OUTRAS TABELAS INDEPENDENTES
        await pool.query(`
            CREATE TABLE IF NOT EXISTS search_history (
                term TEXT PRIMARY KEY,
                count INTEGER DEFAULT 1
            );
        `).catch(e => console.error('Erro ao criar tabela search_history:', e.message));

        await pool.query(`
            CREATE TABLE IF NOT EXISTS site_stats (
                stat_key VARCHAR(255) PRIMARY KEY,
                stat_value BIGINT DEFAULT 0
            );
        `).catch(e => console.error('Erro ao criar tabela site_stats:', e.message));
        
        console.log("Tabelas base (stores, products, history, stats) criadas.");

        // --- 3. CRIAR TABELAS COM DEPENDÊNCIA DE FK (prices) ---
        // DEVE AGUARDAR STORES E PRODUCTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS prices (
                store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                price NUMERIC NOT NULL,
                image_url TEXT,
                PRIMARY KEY (store_id, product_id)
            );
        `);
        console.log("Tabela prices criada.");

        // --- 4. EXECUTAR ALTER TABLES ---
        // Agora que as tabelas existem, podemos adicionar colunas (como lat/lon e promoções)

        // Stores
        await pool.query(`
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS lat FLOAT DEFAULT 0.0;
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS lon FLOAT DEFAULT 0.0;
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS street TEXT;
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS number TEXT;
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS neighborhood TEXT;
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone TEXT;
        `);
        // Products
        await pool.query(`
            ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
        `);
        // Prices
        await pool.query(`
            ALTER TABLE prices ADD COLUMN IF NOT EXISTS promo_price NUMERIC;
            ALTER TABLE prices ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMP;
        `);
        
        // Correção pontual, se necessário
        await pool.query('ALTER TABLE stores ALTER COLUMN lng DROP NOT NULL').catch(() => {});

        console.log("ALTER TABLEs executados com sucesso. O esquema está pronto.");

    } catch (e) {
        console.error('ERRO FATAL NA INICIALIZAÇÃO DO BANCO DE DADOS. Verifique as chaves estrangeiras e a sintaxe SQL.', e);
        // Garante que o servidor não inicie sem o DB
        process.exit(1);
    }
}

// Endpoint: GET /api/store/:id
app.get('/api/store/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT id, name, logo_url, street, number, neighborhood, phone FROM stores WHERE id = $1', [id]);
        client.release();
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Loja não encontrada' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: GET /api/stores
app.get('/api/stores', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT s.id, s.name, s.logo_url, s.is_blocked,
            EXISTS (
                SELECT 1 FROM prices p 
                WHERE p.store_id = s.id 
                AND p.promo_price IS NOT NULL 
                AND p.promo_expires_at > NOW()
            ) as has_promo
            FROM stores s 
            ORDER BY s.name
        `);
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: POST /api/login
app.post('/api/login', async (req, res) => {
    const { id, password } = req.body;
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT id, name, is_blocked, logo_url FROM stores WHERE id = $1 AND password = $2', [id, password]);
        client.release();
        if (result.rows.length > 0) {
            if (result.rows[0].is_blocked) {
                return res.status(403).json({ error: 'Acesso negado: Esta conta está bloqueada.' });
            }
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ error: 'Credenciais inválidas' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: GET /api/merchant/products?store_id=...
app.get('/api/merchant/products', async (req, res) => {
    const { store_id } = req.query;
    if (!store_id) return res.status(400).json({ error: 'Missing store_id' });
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT p.name, p.category, pr.price, pr.promo_price, pr.promo_expires_at, pr.image_url, s.name as store_name
             FROM prices pr
             
             JOIN products p ON p.id = pr.product_id
             JOIN stores s ON s.id = pr.store_id
             WHERE pr.store_id = $1
             ORDER BY p.name`,
            [store_id]
        );
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: POST /api/merchant/products
app.post('/api/merchant/products', upload.single('image'), async (req, res) => {
    const { store_id, product_name, price, category, promo_price } = req.body;
    if (!store_id || !product_name || !price) return res.status(400).json({ error: 'Dados incompletos' });
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const promo_expires_at = promo_price ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null; // 24h a partir de agora

    try {
        const client = await pool.connect();

        // 1. Find or create product
        let productRes = await client.query('SELECT id FROM products WHERE name ILIKE $1', [product_name]);
        let productId;
        if (productRes.rows.length === 0) {
            const newProd = await client.query('INSERT INTO products (name, category) VALUES ($1, $2) RETURNING id', [product_name, category]);
            productId = newProd.rows[0].id;
        } else {
            productId = productRes.rows[0].id;
            if (category) {
                await client.query('UPDATE products SET category = $1 WHERE id = $2', [category, productId]);
            }
        }

        // 2. Insert or Update price
        await client.query(
            `INSERT INTO prices (store_id, product_id, price, image_url, promo_price, promo_expires_at) 
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (store_id, product_id) 
             DO UPDATE SET price = $3, image_url = COALESCE($4, prices.image_url), promo_price = $5, promo_expires_at = $6`,
            [store_id, productId, price, image_url, promo_price || null, promo_expires_at]
        );

        client.release();
        res.json({ success: true, message: 'Produto atualizado!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: POST /api/merchant/logo (Upload de Logo)
app.post('/api/merchant/logo', upload.single('logo'), async (req, res) => {
    const { store_id } = req.body;
    if (!store_id || !req.file) return res.status(400).json({ error: 'Dados incompletos' });
    const logo_url = `/uploads/${req.file.filename}`;
    try {
        const client = await pool.connect();
        await client.query('UPDATE stores SET logo_url = $1 WHERE id = $2', [logo_url, store_id]);
        client.release();
        res.json({ success: true, logo_url });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: GET /api/search?product=...
app.get('/api/search', async (req, res) => {
    const { product } = req.query;
    if (!product) return res.status(400).json({ error: 'Missing product' });

    try {
        const client = await pool.connect();
        
        // Salvar histórico de busca
        try {
            await client.query(`
                INSERT INTO search_history (term, count) 
                VALUES ($1, 1) 
                ON CONFLICT (term) DO UPDATE SET count = search_history.count + 1
            `, [product.toLowerCase()]);
        } catch (histErr) {
            console.error('Erro ao salvar histórico (busca continuará):', histErr.message);
        }

        // Busca aprimorada: similaridade, ignora acentos e aceita correspondências parciais
        const result = await client.query(
            `SELECT s.id as store_id, s.name as store_name, s.rating, pr.price, pr.promo_price, pr.promo_expires_at, pr.image_url, s.logo_url, s.street, s.number, s.neighborhood, s.phone, p.category,
                    similarity(unaccent(lower(p.name)), unaccent(lower($1))) AS sim
             FROM prices pr
             JOIN products p ON p.id = pr.product_id
             JOIN stores s ON s.id = pr.store_id
             WHERE (unaccent(lower(p.name)) ILIKE unaccent(lower($1))
                    OR similarity(unaccent(lower(p.name)), unaccent(lower($1))) > 0.3)
               AND (s.is_blocked IS NULL OR s.is_blocked = FALSE)
             ORDER BY sim DESC, COALESCE(CASE WHEN pr.promo_expires_at > NOW() THEN pr.promo_price END, pr.price) ASC`,
            [product]
        );
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: GET /api/search/trending - Termos mais buscados
app.get('/api/search/trending', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT term FROM search_history ORDER BY count DESC LIMIT 5');
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: GET /api/offers/trending - Top 10 Ofertas Ativas
app.get('/api/offers/trending', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT s.id as store_id, s.name as store_name, s.rating, pr.price, pr.promo_price, pr.promo_expires_at, pr.image_url, s.logo_url, s.street, s.number, s.neighborhood, s.phone, p.category, p.name as product_name
             FROM prices pr
             JOIN products p ON p.id = pr.product_id
             JOIN stores s ON s.id = pr.store_id
             WHERE pr.promo_price IS NOT NULL 
               AND pr.promo_expires_at > NOW()
               AND (s.is_blocked IS NULL OR s.is_blocked = FALSE)
             LIMIT 10`
        );
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: POST /api/track_visit - Rastreia visitas ao site
app.post('/api/track_visit', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query(`
            INSERT INTO site_stats (stat_key, stat_value)
            VALUES ('total_visits', 1)
            ON CONFLICT (stat_key)
            DO UPDATE SET stat_value = site_stats.stat_value + 1;
        `);
        client.release();
        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Erro ao rastrear visita:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN ENDPOINTS ---

// GET /api/admin/stats - Relatórios simples
// APLICA O MIDDLEWARE: Tudo que começar com /api/admin precisará da chave secreta
app.use('/api/admin', requireAdminSecret);

// Rota de login admin para trocar a chave secreta por um token curto
app.post('/api/admin/login', (req, res) => {
    const { key } = req.body;
    const serverKey = process.env.ADMIN_SECRET_KEY;

    if (!key || key !== serverKey) {
        return res.status(403).json({ error: 'Chave inválida' });
    }
    
    res.json({ success: true, message: 'Autenticado com sucesso' });
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const client = await pool.connect();
        const stores = await client.query('SELECT COUNT(*) FROM stores');
        const products = await client.query('SELECT COUNT(*) FROM products');
        const prices = await client.query('SELECT COUNT(*) FROM prices');
        const visitsResult = await client.query("SELECT stat_value FROM site_stats WHERE stat_key = 'total_visits'");
        const visits = visitsResult.rows.length > 0 ? visitsResult.rows[0].stat_value : 0;
        client.release();
        res.json({
            stores: stores.rows[0].count,
            products: products.rows[0].count,
            prices: prices.rows[0].count,
            visits: visits
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/stores - Listar todas as lojas com detalhes
app.get('/api/admin/stores', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM stores ORDER BY id');
        client.release();
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/stores - Adicionar loja
app.post('/api/admin/stores', async (req, res) => {
    const { name, password, street, number, neighborhood, phone } = req.body;
    if (!name || !password) {
        return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
    }
    try {
        const client = await pool.connect();
        
        // Verifica se já existe uma loja com esse nome
        const check = await client.query('SELECT id FROM stores WHERE name = $1', [name]);
        if (check.rows.length > 0) {
            client.release();
            return res.status(400).json({ error: 'Já existe uma loja com este nome.' });
        }

        const result = await client.query(
            'INSERT INTO stores (name, password, rating, lat, lon, street, number, neighborhood, phone) VALUES ($1, $2, 5.0, 0.0, 0.0, $3, $4, $5, $6) RETURNING *',
            [name, password, street, number, neighborhood, phone]
        );
        client.release();
        res.json(result.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/stores/:id - Editar loja
app.put('/api/admin/stores/:id', async (req, res) => {
    const { id } = req.params;
    const { name, password, street, number, neighborhood, phone } = req.body;
    try {
        const client = await pool.connect();
        await client.query('UPDATE stores SET name = $1, password = $2, street = $3, number = $4, neighborhood = $5, phone = $6 WHERE id = $7', [name, password, street, number, neighborhood, phone, id]);
        client.release();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/stores/:id - Excluir loja
app.delete('/api/admin/stores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        // Remove preços associados primeiro para manter integridade
        await client.query('DELETE FROM prices WHERE store_id = $1', [id]);
        await client.query('DELETE FROM stores WHERE id = $1', [id]);
        client.release();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/admin/stores/:id/block - Bloquear/Desbloquear loja
app.patch('/api/admin/stores/:id/block', async (req, res) => {
    const { id } = req.params;
    const { is_blocked } = req.body;
    try {
        const client = await pool.connect();
        await client.query('UPDATE stores SET is_blocked = $1 WHERE id = $2', [is_blocked, id]);
        client.release();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
// INICIA O SERVIDOR SOMENTE APÓS A ESTRUTURA DO DB SER GARANTIDA
initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0',() => console.log(`Servidor rodando na porta ${PORT}`));
}).catch(e => {
    console.error("Falha ao iniciar o servidor após erro na inicialização do DB:", e);
    process.exit(1);
});
