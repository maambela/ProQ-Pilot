require('dotenv').config();

const mysql = require('mysql2/promise');

const cloudSqlInstance = process.env.INSTANCE_CONNECTION_NAME || process.env.CLOUD_SQL_CONNECTION_NAME;
const socketPath = process.env.DB_SOCKET_PATH || (cloudSqlInstance ? `/cloudsql/${cloudSqlInstance}` : null);

const dbConfig = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'proq_pilot',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 30000)
};

if (socketPath) {
    dbConfig.socketPath = socketPath;
    console.log(`[DB] Using Cloud SQL socket: ${socketPath}`);
} else {
    dbConfig.host = process.env.DB_HOST || 'localhost';
    dbConfig.port = Number(process.env.DB_PORT || 3306);
    console.log(`[DB] Using MySQL TCP: ${dbConfig.host}:${dbConfig.port}`);
}

const db = mysql.createPool(dbConfig);

db.getConnection()
    .then((connection) => {
        console.log('[DB] MySQL pool ready');
        connection.release();
    })
    .catch((error) => {
        console.error('[DB] Initial connection failed:', error.message);
        console.error('[DB] Check DB_USER, DB_PASSWORD, DB_NAME, INSTANCE_CONNECTION_NAME, and Cloud SQL Client IAM role.');
    });

module.exports = db;
