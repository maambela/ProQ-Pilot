-- Product catalogue reset and cleanup for ProQ Pilot.
-- Review the SELECT results first and take a Cloud SQL backup before running the DELETE section.
-- This clears the catalogue and preserves users, orders, payments, and product rows referenced by OrderItems.

-- 1. Preview what will be removed.
SELECT 'product_images' AS table_name, COUNT(*) AS rows_to_remove
FROM product_images;

SELECT 'products_without_order_history' AS table_name, COUNT(*) AS rows_to_remove
FROM products p
LEFT JOIN OrderItems oi ON oi.product_id = p.id
WHERE oi.product_id IS NULL;

SELECT p.id, p.product_number, p.product_name, p.supplier_source,
       p.status, p.is_active, p.quantity
FROM products p
LEFT JOIN OrderItems oi ON oi.product_id = p.id
WHERE oi.product_id IS NULL
ORDER BY p.supplier_source, p.id;

SELECT 'historical_products_to_hide' AS table_name, COUNT(*) AS rows_to_update
FROM products p
INNER JOIN OrderItems oi ON oi.product_id = p.id;

-- 2. Destructive reset.
START TRANSACTION;

-- Carts and wishlists are disposable product references.
DELETE FROM Cart;
DELETE FROM wishlist;

-- Images are catalogue data and are not needed to render historical orders.
DELETE FROM product_images;

-- Remove all products that are not referenced by historical orders.
-- Products referenced by OrderItems remain so order history stays valid.
DELETE p
FROM products p
LEFT JOIN OrderItems oi ON oi.product_id = p.id
WHERE oi.product_id IS NULL;

-- Keep order-linked rows for history, but ensure they cannot reappear in the storefront.
UPDATE products p
INNER JOIN OrderItems oi ON oi.product_id = p.id
SET p.quantity = 0,
    p.is_active = 0,
    p.status = 'archived',
    p.updated_at = NOW();

-- Reset sync statistics so the next supplier run starts cleanly.
DELETE FROM supplier_sync_status;

COMMIT;

-- 3. Verify the result.
SELECT COUNT(*) AS remaining_products FROM products;
SELECT COUNT(*) AS remaining_product_images FROM product_images;
SELECT supplier_source, status, is_active, COUNT(*) AS total
FROM products
GROUP BY supplier_source, status, is_active
ORDER BY supplier_source, status, is_active;
