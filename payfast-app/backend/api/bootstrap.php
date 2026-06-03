<?php
/**
 * Bootstrap File
 * Loads environment variables and initializes the application
 */

// Error reporting based on environment
if (($_ENV['APP_ENV'] ?? 'production') === 'production') {
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    ini_set('display_errors', 0);
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
}

// Set timezone
date_default_timezone_set('Africa/Johannesburg');

/**
 * Load environment variables from .env file
 */
function loadEnv($path) {
    if (!file_exists($path)) {
        throw new Exception(".env file not found at: {$path}");
    }
    
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    
    foreach ($lines as $line) {
        // Skip comments
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        
        // Parse key=value
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            
            // Remove quotes if present
            if (preg_match('/^(["\'])(.*)\\1$/', $value, $matches)) {
                $value = $matches[2];
            }
            
            // Set environment variable
            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $value;
                putenv("{$key}={$value}");
            }
        }
    }
}

// Load .env file
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
    loadEnv($envPath);
} else {
    // For first-time setup, try .env.example
    $envExamplePath = __DIR__ . '/../.env.example';
    if (file_exists($envExamplePath)) {
        throw new Exception(
            "Please copy .env.example to .env and configure your settings.\n" .
            "Command: cp backend/.env.example backend/.env"
        );
    } else {
        throw new Exception(".env file is required. Please create it from .env.example");
    }
}

/**
 * Get environment variable with default fallback
 */
function env($key, $default = null) {
    $value = $_ENV[$key] ?? getenv($key);
    
    if ($value === false) {
        return $default;
    }
    
    // Convert string booleans to actual booleans
    switch (strtolower($value)) {
        case 'true':
        case '(true)':
            return true;
        case 'false':
        case '(false)':
            return false;
        case 'null':
        case '(null)':
            return null;
    }
    
    return $value;
}

/**
 * CORS Headers
 */
function setCORSHeaders() {
    $allowedOrigins = explode(',', env('ALLOWED_ORIGINS', '*'));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    if (in_array('*', $allowedOrigins) || in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: " . ($origin ?: '*'));
        header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Authorization");
        header("Access-Control-Allow-Credentials: true");
    }
    
    // Handle preflight requests
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/**
 * Send JSON response
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_PRETTY_PRINT);
    exit;
}

/**
 * Get JSON input
 */
function getJsonInput() {
    $input = file_get_contents('php://input');
    return json_decode($input, true);
}

/**
 * Validate required fields
 */
function validateRequired($data, $fields) {
    $missing = [];
    foreach ($fields as $field) {
        if (!isset($data[$field]) || empty($data[$field])) {
            $missing[] = $field;
        }
    }
    
    if (!empty($missing)) {
        jsonResponse([
            'success' => false,
            'error' => 'Missing required fields: ' . implode(', ', $missing)
        ], 400);
    }
}

// Require database config
require_once __DIR__ . '/config/database.php';
