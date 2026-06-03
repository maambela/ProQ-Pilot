<?php
/**
 * Verify Payment Status API
 * GET /backend/api/verify-payment.php?payment_id=XXX
 * 
 * Checks the status of a payment
 */

require_once __DIR__ . '/../../bootstrap.php';

setCORSHeaders();

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Get payment ID from query string
    $merchantPaymentId = $_GET['payment_id'] ?? '';
    
    if (empty($merchantPaymentId)) {
        jsonResponse([
            'success' => false,
            'error' => 'Payment ID is required'
        ], 400);
    }
    
    // Get payment from database
    $db = getDB();
    $stmt = $db->prepare("
        SELECT 
            merchant_payment_id,
            payfast_payment_id,
            payment_status,
            item_name,
            amount_gross,
            amount_fee,
            amount_net,
            name_first,
            name_last,
            email_address,
            created_at,
            paid_at
        FROM payments 
        WHERE merchant_payment_id = :payment_id
    ");
    
    $stmt->execute(['payment_id' => $merchantPaymentId]);
    $payment = $stmt->fetch();
    
    if (!$payment) {
        jsonResponse([
            'success' => false,
            'error' => 'Payment not found'
        ], 404);
    }
    
    // Return payment details
    jsonResponse([
        'success' => true,
        'payment' => [
            'merchant_payment_id' => $payment['merchant_payment_id'],
            'payfast_payment_id' => $payment['payfast_payment_id'],
            'status' => $payment['payment_status'],
            'item_name' => $payment['item_name'],
            'amount' => [
                'gross' => floatval($payment['amount_gross']),
                'fee' => floatval($payment['amount_fee']),
                'net' => floatval($payment['amount_net']),
                'currency' => 'ZAR'
            ],
            'customer' => [
                'name' => $payment['name_first'] . ' ' . $payment['name_last'],
                'email' => $payment['email_address']
            ],
            'created_at' => $payment['created_at'],
            'paid_at' => $payment['paid_at']
        ]
    ]);
    
} catch (Exception $e) {
    error_log("Payment verification error: " . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => 'Failed to verify payment'
    ], 500);
}
