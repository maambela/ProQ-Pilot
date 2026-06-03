/**
 * Duo License Logging Utility
 * Logs all Duo operations to database for auditing and debugging
 */

const db = require('./db');

const DuoLogger = {
  /**
   * Log an action to duo_license_history for audit trail
   */
  async logHistory(duoLicenseId, action, previousLicenses, newLicenses, notes = null) {
    try {
      const connection = await db.getConnection();
      await connection.query(
        `INSERT INTO duo_license_history 
         (duo_license_id, action, previousLicenses, newLicenses, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [duoLicenseId, action, previousLicenses, newLicenses, notes]
      );
      connection.release();
    } catch (error) {
      console.error('Error logging to duo_license_history:', error);
    }
  },

  /**
   * Log an API operation to duo_license_logs
   */
  async logOperation(duoLicenseId, action, details, status = 'pending', errorMessage = null) {
    try {
      const connection = await db.getConnection();
      await connection.query(
        `INSERT INTO duo_license_logs 
         (duo_license_id, action, details, status, error_message)
         VALUES (?, ?, ?, ?, ?)`,
        [duoLicenseId, action, JSON.stringify(details), status, errorMessage]
      );
      connection.release();
    } catch (error) {
      console.error('Error logging to duo_license_logs:', error);
    }
  },

  /**
   * Update operation status in duo_license_logs
   */
  async updateOperationStatus(logId, status, errorMessage = null) {
    try {
      const connection = await db.getConnection();
      await connection.query(
        `UPDATE duo_license_logs SET status = ?, error_message = ? WHERE id = ?`,
        [status, errorMessage, logId]
      );
      connection.release();
    } catch (error) {
      console.error('Error updating duo_license_logs:', error);
    }
  },

  /**
   * Create or update administrator record
   */
  async upsertAdministrator(duoLicenseId, email, realname, duoAdministratorId, role = 'admin') {
    try {
      const connection = await db.getConnection();
      await connection.query(
        `INSERT INTO duo_administrators 
         (duo_license_id, email, realname, duoAdministratorId, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE 
         realname = VALUES(realname), 
         duoAdministratorId = VALUES(duoAdministratorId),
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
        [duoLicenseId, email, realname, duoAdministratorId, role]
      );
      connection.release();
    } catch (error) {
      console.error('Error managing duo_administrators:', error);
    }
  },

  /**
   * Get license details with all related data
   */
  async getLicenseDetails(duoLicenseId) {
    try {
      const connection = await db.getConnection();
      const [licenseData] = await connection.query(
        'SELECT * FROM duo_licenses WHERE id = ?',
        [duoLicenseId]
      );
      const [adminData] = await connection.query(
        'SELECT * FROM duo_administrators WHERE duo_license_id = ?',
        [duoLicenseId]
      );
      const [historyData] = await connection.query(
        'SELECT * FROM duo_license_history WHERE duo_license_id = ? ORDER BY created_at DESC LIMIT 10',
        [duoLicenseId]
      );
      connection.release();

      return {
        license: licenseData[0],
        administrators: adminData,
        history: historyData
      };
    } catch (error) {
      console.error('Error retrieving license details:', error);
      return null;
    }
  },

  /**
   * Get all operations for a license
   */
  async getLicenseLogs(duoLicenseId, limit = 50) {
    try {
      const connection = await db.getConnection();
      const [logs] = await connection.query(
        `SELECT * FROM duo_license_logs 
         WHERE duo_license_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [duoLicenseId, limit]
      );
      connection.release();
      return logs;
    } catch (error) {
      console.error('Error retrieving license logs:', error);
      return [];
    }
  }
};

module.exports = DuoLogger;
