# ⚡ Quick Start Guide

Get your PayFast integration running in 10 minutes!

## 🎯 Prerequisites

- MySQL Workbench installed
- MySQL Server running
- Web server with PHP 7.4+ (Apache/Nginx)
- PayFast merchant account

## 🚀 Setup Steps

### 1. Database Setup (2 minutes)

```sql
-- Open MySQL Workbench
-- Execute this:

-- Copy and paste entire contents of database/schema.sql
-- Click the lightning bolt ⚡
```

### 2. Configure Backend (3 minutes)

```bash
# Copy environment file
cp backend/.env.example backend/.env

# Edit backend/.env and fill in:
# - Database credentials
# - PayFast merchant ID, key, and passphrase
# - Your domain URLs
```

### 3. Configure Frontend (1 minute)

Edit `frontend/assets/js/config.js`:

```javascript
API_BASE_URL: 'https://yourdomain.com/backend/api'
```

### 4. Deploy Files (2 minutes)

```
your-domain.com/
├── index.html              ← from frontend/
├── success.html            ← from frontend/
├── cancel.html             ← from frontend/
├── assets/                 ← from frontend/
└── backend/                ← entire backend folder
    ├── api/
    ├── config/
    ├── .env               ← your configured file
    └── bootstrap.php
```

### 5. Test (2 minutes)

```
1. Visit: https://yourdomain.com/backend/api/test-connection.php
   Should return: {"success": true}

2. Visit: https://yourdomain.com/
   Fill form and generate payment

3. Complete test payment on PayFast
```

## ✅ You're Done!

Your PayFast integration is live!

## 📝 Key Configuration Points

### PayFast Dashboard
- Settings → Integration
- Get: Merchant ID, Merchant Key
- Set: Passphrase (create a strong one)

### .env File (Critical!)
```env
PAYFAST_MERCHANT_ID=your_merchant_id
PAYFAST_MERCHANT_KEY=your_merchant_key  
PAYFAST_PASSPHRASE=your_passphrase
PAYFAST_MODE=live
```

### Database Connection
```env
DB_HOST=localhost
DB_DATABASE=payfast_production
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
```

### URLs (Must be HTTPS!)
```env
PAYFAST_RETURN_URL=https://yourdomain.com/success.html
PAYFAST_CANCEL_URL=https://yourdomain.com/cancel.html
PAYFAST_NOTIFY_URL=https://yourdomain.com/backend/api/webhook.php
```

## 🔍 Quick Verification

Test each component:

```bash
# 1. Database
https://yourdomain.com/backend/api/test-connection.php

# 2. Payment generation
https://yourdomain.com/
# Fill form, click generate

# 3. Check database
# In MySQL Workbench:
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
```

## ⚠️ Common Issues

### "Database connection failed"
- Check DB credentials in .env
- Verify MySQL is running
- Check user permissions

### "Signature mismatch"  
- Verify passphrase matches PayFast dashboard
- No extra spaces in passphrase
- Check PAYFAST_MODE is 'live'

### "Webhook not working"
- URL must be publicly accessible
- Must use HTTPS
- Check payment_logs table

## 📖 Full Documentation

See `docs/DEPLOYMENT.md` for complete deployment guide.

## 🆘 Need Help?

1. Check `payment_logs` table in database
2. Review PayFast documentation
3. Contact PayFast support: [email protected]

---

**That's it! You're ready to accept payments!** 🎉
