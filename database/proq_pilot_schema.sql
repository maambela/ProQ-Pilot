-- ProQ Pilot Cloud SQL schema
-- Run this in Google Cloud SQL Query Studio for your MySQL instance.
-- Database secret should be: PROQ_DB_NAME=proq_pilot

CREATE DATABASE IF NOT EXISTS proq_pilot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE proq_pilot;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  userID INT AUTO_INCREMENT PRIMARY KEY,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  contact VARCHAR(50) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'client',
  isActive TINYINT(1) NOT NULL DEFAULT 0,
  verificationToken VARCHAR(255) NULL,
  verificationTokenExpires DATETIME NULL,
  resetToken VARCHAR(255) NULL,
  resetTokenExpires DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_active (isActive)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS BrandMargins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(100) NOT NULL UNIQUE,
  margin_percentage DECIMAL(6,2) NOT NULL DEFAULT 20.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO BrandMargins (brand_name, margin_percentage) VALUES
  ('HP', 20.00),
  ('DELL', 20.00),
  ('LENOVO', 20.00),
  ('APPLE', 20.00),
  ('ACER', 20.00),
  ('MICROSOFT', 20.00),
  ('DEFAULT', 20.00)
ON DUPLICATE KEY UPDATE margin_percentage = VALUES(margin_percentage);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_number VARCHAR(120) NOT NULL UNIQUE,
  product_name VARCHAR(500) NOT NULL,
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  warehouse_price DECIMAL(12,2) NULL,
  quantity INT NOT NULL DEFAULT 0,
  brand VARCHAR(150) NULL,
  processor VARCHAR(150) NULL,
  supplier_source VARCHAR(50) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'approved',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_status_active (status, is_active),
  INDEX idx_products_brand (brand),
  INDEX idx_products_supplier_source (supplier_source),
  INDEX idx_products_number (product_number),
  FULLTEXT INDEX ft_products_search (product_name, description, brand, processor)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS supplier_sync_status (
  supplier VARCHAR(50) PRIMARY KEY,
  last_success_at DATETIME NULL,
  fetched_count INT NOT NULL DEFAULT 0,
  in_stock_count INT NOT NULL DEFAULT 0,
  added_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url TEXT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_images_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE,
  INDEX idx_product_images_product (product_id),
  INDEX idx_product_images_primary (product_id, is_primary, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255) NULL,
  city VARCHAR(120) NOT NULL,
  province VARCHAR(120) NULL,
  postal_code VARCHAR(50) NULL,
  country VARCHAR(120) NOT NULL DEFAULT 'South Africa',
  phone VARCHAR(50) NULL,
  delivery_instructions TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_addresses_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE CASCADE,
  INDEX idx_addresses_user (userID)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  addressID INT NULL,
  reference VARCHAR(120) NULL UNIQUE,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE RESTRICT,
  CONSTRAINT fk_orders_address
    FOREIGN KEY (addressID) REFERENCES Addresses(id)
    ON DELETE SET NULL,
  INDEX idx_orders_user (userID),
  INDEX idx_orders_status (status),
  INDEX idx_orders_reference (reference)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS OrderItems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orderitems_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_orderitems_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE RESTRICT,
  INDEX idx_orderitems_order (order_id),
  INDEX idx_orderitems_product (product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  userID INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  provider VARCHAR(80) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  provider_response JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE RESTRICT,
  INDEX idx_payments_order (order_id),
  INDEX idx_payments_user (userID),
  INDEX idx_payments_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Cart (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  productID INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cart_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE CASCADE,
  CONSTRAINT fk_cart_product
    FOREIGN KEY (productID) REFERENCES products(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_cart_user_product (userID, productID),
  INDEX idx_cart_user (userID)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wishlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wishlist_user
    FOREIGN KEY (user_id) REFERENCES users(userID)
    ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_wishlist_user_product (user_id, product_id),
  INDEX idx_wishlist_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  organization_name VARCHAR(255) NOT NULL,
  duo_account_id VARCHAR(120) NULL,
  user_limit INT NOT NULL DEFAULT 0,
  admin_emails TEXT NULL,
  api_hostname VARCHAR(255) NULL,
  integration_key VARCHAR(255) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_org_user
    FOREIGN KEY (customer_id) REFERENCES users(userID)
    ON DELETE CASCADE,
  INDEX idx_duo_org_customer (customer_id),
  INDEX idx_duo_org_account (duo_account_id),
  INDEX idx_duo_org_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  organization_id INT NULL,
  organization_name VARCHAR(255) NULL,
  duo_account_id VARCHAR(120) NULL,
  api_hostname VARCHAR(255) NULL,
  integration_key VARCHAR(255) NULL,
  user_limit INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_licenses_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE CASCADE,
  CONSTRAINT fk_duo_licenses_org
    FOREIGN KEY (organization_id) REFERENCES duo_organizations(id)
    ON DELETE SET NULL,
  INDEX idx_duo_licenses_user (userID),
  INDEX idx_duo_licenses_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  cart_product_id VARCHAR(120) NOT NULL,
  cart_type VARCHAR(80) NOT NULL DEFAULT 'duo',
  quantity INT NOT NULL DEFAULT 1,
  duo_config_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_cart_user
    FOREIGN KEY (userID) REFERENCES users(userID)
    ON DELETE CASCADE,
  UNIQUE KEY uq_duo_cart_user_product (userID, cart_product_id),
  INDEX idx_duo_cart_user (userID)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_order_items_meta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  cart_product_id VARCHAR(120) NOT NULL,
  cart_type VARCHAR(80) NOT NULL DEFAULT 'duo',
  duo_config_json JSON NULL,
  duo_account_id VARCHAR(120) NULL,
  api_hostname VARCHAR(255) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_meta_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_duo_meta_order_product (order_id, cart_product_id),
  INDEX idx_duo_meta_order (order_id),
  INDEX idx_duo_meta_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_administrators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  duo_license_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  realname VARCHAR(255) NULL,
  duoAdministratorId VARCHAR(120) NULL,
  role VARCHAR(100) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_admin_license
    FOREIGN KEY (duo_license_id) REFERENCES duo_licenses(id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_duo_admin_license_email (duo_license_id, email),
  INDEX idx_duo_admin_license (duo_license_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_license_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  duo_license_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  previousLicenses INT NULL,
  newLicenses INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_history_license
    FOREIGN KEY (duo_license_id) REFERENCES duo_licenses(id)
    ON DELETE CASCADE,
  INDEX idx_duo_history_license (duo_license_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duo_license_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  duo_license_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSON NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_duo_logs_license
    FOREIGN KEY (duo_license_id) REFERENCES duo_licenses(id)
    ON DELETE CASCADE,
  INDEX idx_duo_logs_license (duo_license_id),
  INDEX idx_duo_logs_status (status)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- Optional compatibility views for Cloud SQL instances where table names are case-sensitive.
-- Your code uses both products/Products and orders/Orders.
-- If these two statements fail with "already exists", skip them because your instance is case-insensitive.
CREATE OR REPLACE VIEW Products AS SELECT * FROM products;
CREATE OR REPLACE VIEW Orders AS SELECT * FROM orders;
