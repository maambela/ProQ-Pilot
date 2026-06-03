# 🚀 Production Deployment Guide

Complete step-by-step guide to deploy your PayFast integration to production.

## 📋 Prerequisites

Before you begin, ensure you have:

- [ ] Web hosting with PHP 7.4+ and MySQL 5.7+
- [ ] Domain name with SSL certificate (HTTPS required)
- [ ] PayFast merchant account (approved and active)
- [ ] MySQL Workbench or database access
- [ ] FTP/SFTP access to your server

## 🗄️ Step 1: Database Setup

### 1.1 Create Database in MySQL Workbench

1. **Open MySQL Workbench**
2. **Connect to your production database server**
3. **Execute the schema**:
   - File → Open SQL Script
   - Select `database/schema.sql`
   - Click the lightning bolt ⚡ to execute
   
4. **Verify tables created**:
   ```sql
   USE payfast_production;
   SHOW TABLES;
   ```
   
   You should see:
   - `payments`
   - `payment_logs`

### 1.2 Create Database User (Recommended)

For security, create a dedicated database user:

```sql
CREATE USER 'payfast_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON payfast_production.* TO 'payfast_user'@'localhost';
FLUSH PRIVILEGES;
```

**Save these credentials** - you'll need them for the `.env` file.

## 📤 Step 2: Upload Files

### 2.1 Upload Backend

Upload the entire `backend/` folder to your server:

```
your-domain.com/
└── backend/
    ├── config/
    ├── api/
    ├── bootstrap.php
    └── .env (create this next)
```

### 2.2 Upload Frontend

Upload the `frontend/` folder contents to your web root:

```
your-domain.com/
├── index.html
├── success.html
├── cancel.html
└── assets/
    ├── css/
    └── js/
```

## ⚙️ Step 3: Configure Backend

### 3.1 Create .env File

1. **Copy the example file**:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. **Edit backend/.env** with your actual credentials:

```env
# Application
APP_ENV=production
APP_DEBUG=false
APP_URL=https://yourdomain.com

# Database (use credentials from Step 1.2)
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=payfast_production
DB_USERNAME=payfast_user
DB_PASSWORD=your_secure_password

# PayFast Credentials (get from PayFast dashboard)
PAYFAST_MERCHANT_ID=10012345
PAYFAST_MERCHANT_KEY=abc123xyz789
PAYFAST_PASSPHRASE=YourSecurePassphrase2024!
PAYFAST_MODE=live

# Callback URLs (MUST be HTTPS)
PAYFAST_RETURN_URL=https://yourdomain.com/success.html
PAYFAST_CANCEL_URL=https://yourdomain.com/cancel.html
PAYFAST_NOTIFY_URL=https://yourdomain.com/backend/api/webhook.php

# Security
ALLOWED_ORIGINS=https://yourdomain.com
ENABLE_IP_VERIFICATION=true
ENABLE_SIGNATURE_VERIFICATION=true

# Logging
ENABLE_LOGGING=true
LOG_LEVEL=info
```

### 3.2 Get PayFast Credentials

1. **Login to PayFast**: https://www.payfast.co.za/
2. **Navigate to**: Settings → Integration
3. **Copy your credentials**:
   - Merchant ID
   - Merchant Key
4. **Create a Passphrase**:
   - Click "Edit" next to Passphrase
   - Enter a strong passphrase (e.g., `MySecure2024!Passphrase`)
   - **Save it** and write it down!

### 3.3 Set File Permissions

```bash
chmod 644 backend/.env
chmod 755 backend/
chmod 755 backend/api/
chmod 644 backend/api/*.php
```

## 🌐 Step 4: Configure Frontend

### 4.1 Update API URL

Edit `frontend/assets/js/config.js`:

```javascript
const CONFIG = {
    API_BASE_URL: 'https://yourdomain.com/backend/api',  // ← Update this!
    // ... rest of config
};
```

### 4.2 Update Contact Email

In `frontend/cancel.html`, update the support email:

```html
<a href="mailto:your-email@yourdomain.com" class="btn btn-secondary">
    Contact Support
</a>
```

## 🧪 Step 5: Test Your Setup

### 5.1 Test Database Connection

Visit: `https://yourdomain.com/backend/api/test-connection.php`

**Expected response**:
```json
{
    "success": true,
    "message": "Database connection successful",
    "database": "payfast_production",
    "tables": ["payments", "payment_logs"],
    "payment_count": 0
}
```

**If you see an error**: Check your `.env` database credentials.

### 5.2 Test Payment Generation

1. **Visit**: `https://yourdomain.com/`
2. **Fill in the form**:
   - Amount: `100.00`
   - Item: `Test Product`
   - Customer details
3. **Click "Generate Payment Link"**
4. **You should see** a PayFast payment URL

### 5.3 Test Complete Payment Flow

1. **Generate a payment link** (use a small amount like R5.00)
2. **Click "Open Payment Page"**
3. **Complete payment** on PayFast
4. **Verify**:
   - You're redirected to success.html
   - Payment details are shown
   - Check database:
     ```sql
     SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;
     ```

## 🔐 Step 6: Security Checklist

### 6.1 SSL Certificate

- [ ] HTTPS is enabled on your domain
- [ ] All URLs use `https://` (not `http://`)
- [ ] SSL certificate is valid and not expired

### 6.2 File Security

- [ ] `.env` file is NOT accessible via browser
  - Try accessing: `https://yourdomain.com/backend/.env`
  - Should show 403 Forbidden or 404 Not Found

- [ ] Add to `.htaccess` in backend folder:
  ```apache
  <Files ".env">
      Order allow,deny
      Deny from all
  </Files>
  ```

### 6.3 Database Security

- [ ] Database user has minimal required permissions
- [ ] Database password is strong (16+ characters)
- [ ] Database is not accessible from outside (firewall rules)

### 6.4 Application Security

- [ ] `APP_DEBUG=false` in production
- [ ] `ENABLE_IP_VERIFICATION=true`
- [ ] `ENABLE_SIGNATURE_VERIFICATION=true`
- [ ] Strong PayFast passphrase (16+ characters)

## 📊 Step 7: Monitor Payments

### 7.1 View Payments in MySQL Workbench

```sql
-- All payments
SELECT * FROM payments ORDER BY created_at DESC;

-- Completed payments only
SELECT * FROM payments 
WHERE payment_status = 'COMPLETE' 
ORDER BY paid_at DESC;

-- Today's revenue
SELECT 
    COUNT(*) as total_payments,
    SUM(amount_net) as revenue
FROM payments 
WHERE payment_status = 'COMPLETE' 
  AND DATE(paid_at) = CURDATE();

-- Failed payments
SELECT * FROM payments 
WHERE payment_status = 'FAILED'
ORDER BY created_at DESC;
```

### 7.2 Check Payment Logs

```sql
-- Recent logs
SELECT * FROM payment_logs 
ORDER BY created_at DESC 
LIMIT 50;

-- Error logs
SELECT * FROM payment_logs 
WHERE log_type = 'ERROR'
ORDER BY created_at DESC;
```

## 🐛 Troubleshooting

### Issue: "Database connection failed"

**Solution**:
1. Check `.env` database credentials
2. Verify MySQL service is running
3. Check database user permissions
4. Test connection: `backend/api/test-connection.php`

### Issue: "Signature mismatch"

**Solution**:
1. Verify passphrase in `.env` matches PayFast dashboard
2. Check for extra spaces in passphrase
3. Ensure `PAYFAST_MODE=live` (not sandbox)

### Issue: "Webhook not receiving notifications"

**Solution**:
1. Verify `PAYFAST_NOTIFY_URL` is publicly accessible (HTTPS)
2. Check PayFast dashboard → Integration → Notify URL
3. Temporarily disable IP verification for testing
4. Check `payment_logs` table for errors

### Issue: Payments not saving to database

**Solution**:
1. Check database permissions
2. View `payment_logs` for errors
3. Verify table structure matches schema
4. Check PHP error logs

## 📝 Post-Deployment Checklist

- [ ] Database created and tables exist
- [ ] `.env` file configured with correct credentials
- [ ] PayFast credentials verified
- [ ] Frontend API URL updated
- [ ] SSL certificate active
- [ ] Test payment completed successfully
- [ ] Webhook receiving notifications
- [ ] Payments saving to database
- [ ] Success page displaying correctly
- [ ] Security measures in place

## 🔄 Ongoing Maintenance

### Daily
- Monitor payment logs for errors
- Check failed payments

### Weekly
- Review payment statistics
- Backup database
- Check disk space

### Monthly
- Update dependencies if needed
- Review security logs
- Test payment flow end-to-end

## 📧 Support

If you encounter issues:

1. **Check logs**: `payment_logs` table
2. **Review error messages**: Enable `APP_DEBUG=true` temporarily
3. **PayFast Support**: [email protected]
4. **Check PayFast status**: https://www.payfast.co.za/

## 🎉 Deployment Complete!

Your PayFast integration is now live and ready to accept payments!

**Next steps**:
1. Test with a small real payment
2. Monitor for first few transactions
3. Set up email notifications
4. Create admin dashboard (optional)

---

**Congratulations!** You're now accepting payments with PayFast! 🚀
