-- schema.sql
-- Database schema for Mercado na Rota MVP

CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    rating DECIMAL(2, 1) DEFAULT 0,
    password VARCHAR(255) DEFAULT '123456'
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS prices (
    store_id INT REFERENCES stores(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC(8,2) NOT NULL,
    PRIMARY KEY (store_id, product_id)
);

-- Indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id);
CREATE INDEX IF NOT EXISTS idx_prices_store ON prices(store_id);
