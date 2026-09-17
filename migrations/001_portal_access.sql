-- Run with: npm run db:migrate:access
-- Existing users and purchase history are preserved. Access is approved separately.
CREATE TABLE IF NOT EXISTS portal_companies (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    tenant_id CHAR(36) NOT NULL UNIQUE,
    type ENUM('admin','client') NOT NULL DEFAULT 'client',
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    contact_email VARCHAR(254) NOT NULL DEFAULT '',
    notes TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_user_access (
    user_id BIGINT NOT NULL PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    microsoft_object_id CHAR(36) NULL,
    status ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
    can_purchase TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at DATETIME(3) NULL,
    UNIQUE KEY uq_portal_identity (company_id, microsoft_object_id),
    CONSTRAINT fk_portal_user_company FOREIGN KEY (company_id) REFERENCES portal_companies(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_access_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    object_id CHAR(36) NOT NULL,
    email VARCHAR(254) NOT NULL DEFAULT '',
    display_name VARCHAR(200) NOT NULL DEFAULT '',
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_portal_request_identity (company_id, object_id),
    CONSTRAINT fk_portal_request_company FOREIGN KEY (company_id) REFERENCES portal_companies(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_portal_session_user (user_id),
    KEY idx_portal_session_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_session_tabs (
    token_hash CHAR(64) NOT NULL,
    tab_id VARCHAR(80) NOT NULL,
    seen_at DATETIME(3) NOT NULL,
    PRIMARY KEY (token_hash, tab_id),
    CONSTRAINT fk_portal_tab_session FOREIGN KEY (token_hash) REFERENCES portal_sessions(token_hash) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_oauth_states (
    state_hash CHAR(64) NOT NULL PRIMARY KEY,
    browser_hash CHAR(64) NOT NULL,
    nonce VARCHAR(100) NOT NULL,
    verifier VARCHAR(128) NOT NULL,
    redirect_path VARCHAR(500) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    KEY idx_portal_oauth_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_access_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT NULL,
    actor_email VARCHAR(254) NOT NULL,
    action VARCHAR(80) NOT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_id BIGINT NULL,
    details JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- Serializes access changes, including the last-administrator check.
CREATE TABLE IF NOT EXISTS portal_access_lock (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO portal_access_lock (id) VALUES (1);
