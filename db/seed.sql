-- seed.sql
-- Sample data for Mercado na Rota MVP
TRUNCATE TABLE prices RESTART IDENTITY CASCADE;
TRUNCATE TABLE products RESTART IDENTITY CASCADE;
TRUNCATE TABLE stores RESTART IDENTITY CASCADE;

INSERT INTO stores (name, lat, lng, rating, password) VALUES
  ('Supermercado A', -23.5505, -46.6333, 4.5, '123456'),
  ('Mercado B', -23.5580, -46.6400, 4.2, '123456'),
  ('Padaria C', -23.5450, -46.6300, 4.8, '123456');

INSERT INTO products (name) VALUES
  ('Açúcar'),
  ('Arroz'),
  ('Feijão');

INSERT INTO prices (store_id, product_id, price) VALUES
  (1, 1, 3.99),
  (1, 2, 15.50),
  (2, 1, 4.10),
  (2, 3, 7.20),
  (3, 1, 3.80),
  (3, 2, 15.00);