-- PayFast database schema for ProQ Pilot.
-- Run this in the separate PayFast database configured by DB_DATABASE.

CREATE DATABASE IF NOT EXISTS payfast_production
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;

USE payfast_production;

CREATE TABLE IF NOT EXISTS payments (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	merchant_payment_id VARCHAR(120) NOT NULL UNIQUE,
	payfast_payment_id VARCHAR(120) NULL,
	payment_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
	item_name VARCHAR(255) NOT NULL,
	item_description TEXT NULL,
	amount_gross DECIMAL(12,2) NOT NULL DEFAULT 0.00,
	amount_fee DECIMAL(12,2) NULL DEFAULT 0.00,
	amount_net DECIMAL(12,2) NULL DEFAULT 0.00,
	name_first VARCHAR(100) NULL,
	name_last VARCHAR(100) NULL,
	email_address VARCHAR(255) NULL,
	custom_str1 VARCHAR(255) NULL,
	custom_str2 VARCHAR(255) NULL,
	custom_str3 VARCHAR(255) NULL,
	custom_str4 VARCHAR(255) NULL,
	custom_str5 VARCHAR(255) NULL,
	custom_int1 BIGINT NULL,
	custom_int2 BIGINT NULL,
	custom_int3 BIGINT NULL,
	custom_int4 BIGINT NULL,
	custom_int5 BIGINT NULL,
	ip_address VARCHAR(45) NULL,
	payfast_data JSON NULL,
	signature_verified TINYINT(1) NOT NULL DEFAULT 0,
	paid_at DATETIME NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_payments_status (payment_status),
	INDEX idx_payments_email (email_address),
	INDEX idx_payments_payfast_id (payfast_payment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_logs (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	payment_id BIGINT UNSIGNED NULL,
	log_type VARCHAR(40) NOT NULL,
	message TEXT NOT NULL,
	data JSON NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_payment_logs_payment
		FOREIGN KEY (payment_id) REFERENCES payments(id)
		ON DELETE SET NULL,
	INDEX idx_payment_logs_payment (payment_id),
	INDEX idx_payment_logs_type (log_type)
) ENGINE=InnoDB;
