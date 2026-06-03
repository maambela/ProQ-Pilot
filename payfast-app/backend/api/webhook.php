<?php
/**
 * PayFast Webhook Handler (ITN - Instant Transaction Notification)
 * POST /backend/api/webhook.php
 * 
 * Receives payment notifications from PayFast
 * This URL must be publicly accessible via HTTPS
 */

require_once __DIR__ . '/../../bootstrap.php';

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Method not allowed');
}

try {
    // Get POST data from PayFast
    $pfData = $_POST;
    
    if (empty($pfData)) {
        http_response_code(400);
        exit('No POST data received');
    }
    
    // Log the ITN
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    error_log("PayFast ITN received from IP: {$ipAddress}");
    
    // Step 1: Verify source IP (if enabled)
    if (env('ENABLE_IP_VERIFICATION', true)) {
        if (!verifyPayFastIP($ipAddress)) {
            error_log("Invalid source IP: {$ipAddress}");
            http_response_code(403);
            exit('Invalid source IP');
        }
    }
    
    // Step 2: Verify signature (if enabled)
    if (env('ENABLE_SIGNATURE_VERIFICATION', true)) {
        $signature = $pfData['signature'] ?? '';
        unset($pfData['signature']);
        
        $passphrase = env('PAYFAST_PASSPHRASE');
        $calculatedSignature = generatePayFastSignature($pfData, $passphrase);
        
        if ($signature !== $calculatedSignature) {
            error_log("Signature mismatch. Received: {$signature}, Calculated: {$calculatedSignature}");
            http_response_code(403);
            exit('Invalid signature');
        }
        
        // Add signature back for database storage
        $pfData['signature'] = $signature;
    }
    
    // Step 3: Get payment from database
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM payments WHERE merchant_payment_id = :m_payment_id");
    $stmt->execute(['m_payment_id' => $pfData['m_payment_id'] ?? '']);
    $payment = $stmt->fetch();
    
    if (!$payment) {
        error_log("Payment not found: " . ($pfData['m_payment_id'] ?? 'N/A'));
        logToDatabase(null, 'ERROR', 'Payment not found for ITN', $pfData);
        http_response_code(404);
        exit('Payment not found');
    }
    
    $paymentId = $payment['id'];
    
    // Step 4: Verify payment data
    $amountGross = floatval($pfData['amount_gross'] ?? 0);
    $paymentAmount = floatval($payment['amount_gross']);
    
    if (abs($amountGross - $paymentAmount) > 0.01) {
        error_log("Amount mismatch. Expected: {$paymentAmount}, Received: {$amountGross}");
        logToDatabase($paymentId, 'ERROR', 'Amount mismatch in ITN', $pfData);
        http_response_code(400);
        exit('Amount mismatch');
    }
    
    // Step 5: Update payment in database
    $paymentStatus = strtoupper($pfData['payment_status'] ?? 'PENDING');
    
    $updateStmt = $db->prepare("
        UPDATE payments SET
            payfast_payment_id = :payfast_payment_id,
            payment_status = :payment_status,
            amount_fee = :amount_fee,
            amount_net = :amount_net,
            payfast_data = :payfast_data,
            signature_verified = :signature_verified,
            paid_at = :paid_at,
            updated_at = NOW()
        WHERE id = :id
    ");
    
    $updateStmt->execute([
        'id' => $paymentId,
        'payfast_payment_id' => $pfData['pf_payment_id'] ?? null,
        'payment_status' => $paymentStatus,
        'amount_fee' => $pfData['amount_fee'] ?? 0,
        'amount_net' => $pfData['amount_net'] ?? 0,
        'payfast_data' => json_encode($pfData),
        'signature_verified' => env('ENABLE_SIGNATURE_VERIFICATION', true) ? 1 : 0,
        'paid_at' => $paymentStatus === 'COMPLETE' ? date('Y-m-d H:i:s') : null
    ]);
    
    // Log the ITN
    logToDatabase($paymentId, 'ITN', "Payment status: {$paymentStatus}", $pfData);
    
    // Step 6: Process based on status
    if ($paymentStatus === 'COMPLETE') {
        // Payment successful! Do your business logic here:
        // - Send confirmation email
        // - Activate subscription
        // - Grant access to product
        // - Update inventory
        // etc.
        
        processSuccessfulPayment($payment, $pfData);
        
    } elseif ($paymentStatus === 'FAILED') {
        // Payment failed
        logToDatabase($paymentId, 'WARNING', 'Payment failed', $pfData);
        
    } elseif ($paymentStatus === 'CANCELLED') {
        // Payment cancelled by user
        logToDatabase($paymentId, 'INFO', 'Payment cancelled', $pfData);
    }
    
    // Step 7: Respond to PayFast
    http_response_code(200);
    echo 'OK';
    
} catch (Exception $e) {
    error_log("Webhook error: " . $e->getMessage());
    http_response_code(500);
    exit('Internal server error');
}

/**
 * Verify PayFast source IP
 */
function verifyPayFastIP($ipAddress) {
    $validHosts = [
        'www.payfast.co.za',
        'sandbox.payfast.co.za',
        'w1w.payfast.co.za',
        'w2w.payfast.co.za',
    ];
    
    foreach ($validHosts as $host) {
        $ips = gethostbynamel($host);
        if ($ips && in_array($ipAddress, $ips)) {
            return true;
        }
    }
    
    // For local testing, allow localhost
    if (env('APP_ENV') !== 'production' && in_array($ipAddress, ['127.0.0.1', '::1'])) {
        return true;
    }
    
    return false;
}

/**
 * Generate PayFast signature
 */
function generatePayFastSignature($data, $passphrase = null) {
    $pfOutput = '';
    foreach ($data as $key => $val) {
        if ($key !== 'signature' && $val !== '') {
            $pfOutput .= $key . '=' . urlencode(stripslashes(trim($val))) . '&';
        }
    }
    
    $getString = substr($pfOutput, 0, -1);
    
    if ($passphrase !== null) {
        $getString .= '&passphrase=' . urlencode(trim($passphrase));
    }
    
    return md5($getString);
}

/**
 * Process successful payment
 * Add your business logic here
 */
function processSuccessfulPayment($payment, $pfData) {
    $paymentId = $payment['id'];
    
    // Example: Send confirmation email
    if (env('ENABLE_LOGGING')) {
        logToDatabase($paymentId, 'INFO', 'Processing successful payment', [
            'customer_email' => $payment['email_address'],
            'amount_net' => $pfData['amount_net'] ?? 0
        ]);
    }
    
    // TODO: Add your business logic here
    // Example:
    // - sendConfirmationEmail($payment['email_address'], $payment);
    // - activateUserSubscription($payment['custom_str1']);
    // - grantProductAccess($payment['email_address'], $payment['item_name']);
    // - updateInventory($payment['item_name']);
    
    // For now, just log it
    error_log("Payment completed: ID {$paymentId}, Amount: R" . ($pfData['amount_net'] ?? 0));
}
