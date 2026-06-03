<?php
/**
 * Database Configuration and Connection
 * Uses PDO for secure database operations
 */

class Database {
    private static $instance = null;
    private $connection;
    
    private function __construct() {
        try {
            $host = $_ENV['DB_HOST'] ?? 'localhost';
            $port = $_ENV['DB_PORT'] ?? '3306';
            $dbname = $_ENV['DB_DATABASE'] ?? 'payfast_production';
            $username = $_ENV['DB_USERNAME'] ?? 'root';
            $password = $_ENV['DB_PASSWORD'] ?? '';
            
            $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
            
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];
            
            $this->connection = new PDO($dsn, $username, $password, $options);
            
        } catch (PDOException $e) {
            error_log("Database connection failed: " . $e->getMessage());
            throw new Exception("Database connection failed. Please check your configuration.");
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->connection;
    }
    
    // Prevent cloning
    private function __clone() {}
    
    // Prevent unserialization
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
}

/**
 * Helper function to get database connection
 */
function getDB() {
    return Database::getInstance()->getConnection();
}

/**
 * Log to database
 */
function logToDatabase($paymentId, $type, $message, $data = null) {
    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO payment_logs (payment_id, log_type, message, data)
            VALUES (:payment_id, :log_type, :message, :data)
        ");
        
        $stmt->execute([
            'payment_id' => $paymentId,
            'log_type' => $type,
            'message' => $message,
            'data' => $data ? json_encode($data) : null
        ]);
    } catch (Exception $e) {
        error_log("Failed to log to database: " . $e->getMessage());
    }
}
