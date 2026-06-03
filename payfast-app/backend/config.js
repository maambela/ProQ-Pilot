/**
 * Frontend Configuration
 * Update API_BASE_URL to match your backend URL
 */

const CONFIG = {
    // IMPORTANT: Change this to your actual backend URL
    API_BASE_URL: 'https://yourdomain.com/backend/api',
    
    // For local development, use:
    // API_BASE_URL: 'http://localhost/payfast-app/backend/api',
    
    ENDPOINTS: {
        GENERATE_PAYMENT: '/generate-payment.php',
        VERIFY_PAYMENT: '/verify-payment.php',
        TEST_CONNECTION: '/test-connection.php'
    },
    
    // Payment settings
    CURRENCY: 'ZAR',
    MIN_AMOUNT: 5.00,
    
    // UI settings
    ENABLE_DEBUG: false
};

// Helper function to build full API URL
function getApiUrl(endpoint) {
    return CONFIG.API_BASE_URL + endpoint;
}
