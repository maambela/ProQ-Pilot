<?php
/**
 * Generate Payment Link API
 * POST /backend/api/generate-payment.php
 * 
 * Creates a PayFast payment URL with proper signature
 */

require_once __DIR__ . '/../../bootstrap.php';

setCORSHeaders();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Get and validate input
    $input = getJsonInput();
    validateRequired($input, ['amount', 'item_name', 'name_first', 'name_last', 'email_address']);
    
    // Validate amount
    $amount = floatval($input['amount']);
    $minAmount = floatval(env('MIN_PAYMENT_AMOUNT', 5.00));
    $maxAmount = floatval(env('MAX_PAYMENT_AMOUNT', 1000000.00));
    
    if ($amount < $minAmount) {
        jsonResponse([
            'success' => false,
            'error' => "Minimum amount is R{$minAmount}"
        ], 400);
    }
    
    if ($amount > $maxAmount) {
        jsonResponse([
            'success' => false,
            'error' => "Maximum amount is R{$maxAmount}"
        ], 400);
    }
    
    // Validate email
    if (!filter_var($input['email_address'], FILTER_VALIDATE_EMAIL)) {
        jsonResponse([
            'success' => false,
            'error' => 'Invalid email address'
        ], 400);
    }
    
    // Generate unique payment ID
    $merchantPaymentId = 'PF_' . time() . '_' . bin2hex(random_bytes(4));
    
    // Get PayFast configuration
    $mode = env('PAYFAST_MODE', 'live');
    $merchantId = env('PAYFAST_MERCHANT_ID');
    $merchantKey = env('PAYFAST_MERCHANT_KEY');
    $passphrase = env('PAYFAST_PASSPHRASE');
    
    if ($mode === 'sandbox') {
        $payfastUrl = env('PAYFAST_SANDBOX_URL');
    } else {
        $payfastUrl = env('PAYFAST_LIVE_URL');
    }
    
    // Build payment data
    $paymentData = [
        'merchant_id' => $merchantId,
        'merchant_key' => $merchantKey,
        'return_url' => env('PAYFAST_RETURN_URL'),
        'cancel_url' => env('PAYFAST_CANCEL_URL'),
        'notify_url' => env('PAYFAST_NOTIFY_URL'),
        'name_first' => trim($input['name_first']),
        'name_last' => trim($input['name_last']),
        'email_address' => trim($input['email_address']),
        'm_payment_id' => $merchantPaymentId,
        'amount' => number_format($amount, 2, '.', ''),
        'item_name' => trim($input['item_name']),
        'item_description' => $input['item_description'] ?? trim($input['item_name']),
    ];
    
    // Add optional custom fields
    for ($i = 1; $i <= 5; $i++) {
        if (!empty($input["custom_str{$i}"])) {
            $paymentData["custom_str{$i}"] = $input["custom_str{$i}"];
        }
        if (!empty($input["custom_int{$i}"])) {
            $paymentData["custom_int{$i}"] = $input["custom_int{$i}"];
        }
    }
    
    // Generate signature
    $signature = generatePayFastSignature($paymentData, $passphrase);
    $paymentData['signature'] = $signature;
    
    // Save to database
    $db = getDB();
    $stmt = $db->prepare("
        INSERT INTO payments (
            merchant_payment_id,
            payment_status,
            item_name,
            item_description,
            amount_gross,
            name_first,
            name_last,
            email_address,
            custom_str1,
            custom_str2,
            custom_str3,
            custom_str4,
            custom_str5,
            custom_int1,
            custom_int2,
            custom_int3,
            custom_int4,
            custom_int5,
            ip_address
        ) VALUES (
            :merchant_payment_id,
            'PENDING',
            :item_name,
            :item_description,
            :amount,
            :name_first,
            :name_last,
            :email_address,
            :custom_str1,
            :custom_str2,
            :custom_str3,
            :custom_str4,
            :custom_str5,
            :custom_int1,
            :custom_int2,
            :custom_int3,
            :custom_int4,
            :custom_int5,
            :ip_address
        )
    ");
    
    $stmt->execute([
        'merchant_payment_id' => $merchantPaymentId,
        'item_name' => $paymentData['item_name'],
        'item_description' => $paymentData['item_description'],
        'amount' => $amount,
        'name_first' => $paymentData['name_first'],
        'name_last' => $paymentData['name_last'],
        'email_address' => $paymentData['email_address'],
        'custom_str1' => $input['custom_str1'] ?? null,
        'custom_str2' => $input['custom_str2'] ?? null,
        'custom_str3' => $input['custom_str3'] ?? null,
        'custom_str4' => $input['custom_str4'] ?? null,
        'custom_str5' => $input['custom_str5'] ?? null,
        'custom_int1' => $input['custom_int1'] ?? null,
        'custom_int2' => $input['custom_int2'] ?? null,
        'custom_int3' => $input['custom_int3'] ?? null,
        'custom_int4' => $input['custom_int4'] ?? null,
        'custom_int5' => $input['custom_int5'] ?? null,
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null
    ]);
    
    $paymentId = $db->lastInsertId();
    
    // Log payment creation
    logToDatabase($paymentId, 'INFO', 'Payment link generated', $paymentData);
    
    // Build payment URL
    $paymentUrl = $payfastUrl . '?' . http_build_query($paymentData);
    
    // Return response
    jsonResponse([
        'success' => true,
        'payment_url' => $paymentUrl,
        'merchant_payment_id' => $merchantPaymentId,
        'amount' => $amount,
        'currency' => 'ZAR'
    ]);
    
} catch (Exception $e) {
    error_log("Payment generation error: " . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => env('APP_DEBUG') === 'true' ? $e->getMessage() : 'Payment generation failed'
    ], 500);
}

/**
 * Generate PayFast signature
 */
function generatePayFastSignature($data, $passphrase = null) {
    // Create parameter string
    $pfOutput = '';
    foreach ($data as $key => $val) {
        if ($key !== 'signature' && $val !== '') {
            $pfOutput .= $key . '=' . urlencode(trim($val)) . '&';
        }
    }
    
    // Remove last ampersand
    $getString = substr($pfOutput, 0, -1);
    
    // Add passphrase
    if ($passphrase !== null) {
        $getString .= '&passphrase=' . urlencode(trim($passphrase));
    }
    
    // Generate MD5 signature
    return md5($getString);
}
