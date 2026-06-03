/**
 * Duo Payment Integration Module
 * Handles Duo account creation/upgrade AFTER payment verification
 * 
 * Flow:
 * 1. User configures and adds Duo product to cart (duo-store.js)
 * 2. User completes payment (checkout.html)
 * 3. Payment is verified as 'paid' (order-success.html)
 * 4. This module creates/upgrades Duo account (post-payment)
 * 5. Admin receives confirmation email with dashboard access
 */

class DuoPaymentIntegration {
  /**
   * Main entry point: Process Duo license purchase or upgrade after successful payment
   * Called from order-success.html when order status is 'paid'
   */
  static async processAfterPayment(userID, orderID, paymentReference, order = null) {
    try {
      console.log('[DuoPayment] Processing after payment - Order:', orderID);

      const purchaseConfig = (() => {
        const v = sessionStorage.getItem('duoPurchaseConfig');
        if (!v) return null;
        try { return JSON.parse(v); } catch { return null; }
      })();

      const upgradeConfig = (() => {
        const v = sessionStorage.getItem('duoUpgradeConfig');
        if (!v) return null;
        try { return JSON.parse(v); } catch { return null; }
      })();

      // Fallback: derive config from backend order items (if sessionStorage was cleared)
      const normalizedOrderItems = Array.isArray(order?.items) ? order.items : [];
      const duoPurchaseItem = normalizedOrderItems.find(
        (it) => it?.cart_type === 'duo-security' || it?.type === 'duo-security'
      );
      const duoUpgradeItem = normalizedOrderItems.find(
        (it) => it?.cart_type === 'duo-security-upgrade' || it?.type === 'duo-security-upgrade'
      );

      const purchaseConfigFromOrder = duoPurchaseItem?.duo_config || duoPurchaseItem?.duo_config_json || null;
      const upgradeConfigFromOrder = duoUpgradeItem?.duo_upgrade_config || duoUpgradeItem?.duo_config || duoUpgradeItem?.duo_config_json || null;

      const finalPurchaseConfig = purchaseConfig || purchaseConfigFromOrder;
      const finalUpgradeConfig = upgradeConfig || upgradeConfigFromOrder;

      if (finalPurchaseConfig) {
        console.log('[DuoPayment] Creating account (purchase) using config from session/order');
        return await this.finalizeDuoPurchase(userID, orderID, paymentReference, finalPurchaseConfig);
      }

      if (finalUpgradeConfig) {
        console.log('[DuoPayment] Upgrading account using config from session/order');
        return await this.finalizeDuoUpgrade(userID, orderID, paymentReference, finalUpgradeConfig);
      }

      console.log('[DuoPayment] No Duo config found in session or order payload');
      return null;
    } catch (error) {
      console.error('[DuoPayment] Error in processAfterPayment:', error);
      throw error;
    }
  }

  /**
   * Create a new Duo account after payment is verified
   */
  static async finalizeDuoPurchase(userID, orderID, paymentReference, purchaseConfig) {
    try {
      console.log('[DuoPayment] Creating account:', purchaseConfig.organization_name);

      const payload = {
        organization_name: purchaseConfig.organization_name,
        user_limit: purchaseConfig.user_limit,
        admin_emails: purchaseConfig.admin_emails,
        edition: purchaseConfig.edition || 'PLATFORM',
        customer_email: purchaseConfig.customer_email,
        userId: userID,
        payment_reference: paymentReference,
        order_id: orderID
      };

      const response = await fetch('/api/v1/duo/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('[DuoPayment] Account creation failed:', result);
        
        await this.notifyAdminOfFailure(
          purchaseConfig.admin_emails,
          'account creation',
          purchaseConfig.organization_name,
          result.error
        );

        throw new Error(result.error || 'Failed to create Duo account');
      }

      console.log('[DuoPayment] Account created successfully:', result);
      sessionStorage.removeItem('duoPurchaseConfig');

      return {
        type: 'purchase',
        success: true,
        account_id: result.account_id,
        organization_name: result.organization_name,
        dashboard_url: result.dashboard_url,
        data: result
      };
    } catch (error) {
      console.error('[DuoPayment] Purchase finalization error:', error);
      throw error;
    }
  }

  /**
   * Upgrade an existing Duo account after payment is verified
   */
  static async finalizeDuoUpgrade(userID, orderID, paymentReference, upgradeConfig) {
    try {
      console.log('[DuoPayment] Upgrading account:', upgradeConfig.duo_org_id);

      const payload = {
        duo_org_id: upgradeConfig.duo_org_id,
        new_user_limit: upgradeConfig.new_user_limit,
        userId: userID,
        payment_reference: paymentReference,
        order_id: orderID
      };

      const response = await fetch('/api/v1/duo/upgrade-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('[DuoPayment] Upgrade failed:', result);
        throw new Error(result.error || 'Failed to upgrade Duo account');
      }

      console.log('[DuoPayment] Upgrade completed successfully:', result);
      sessionStorage.removeItem('duoUpgradeConfig');

      return {
        type: 'upgrade',
        success: true,
        organization_name: upgradeConfig.organization_name,
        old_limit: upgradeConfig.old_user_limit,
        new_limit: upgradeConfig.new_user_limit,
        additional_users: upgradeConfig.new_user_limit - upgradeConfig.old_user_limit,
        data: result
      };
    } catch (error) {
      console.error('[DuoPayment] Upgrade finalization error:', error);
      throw error;
    }
  }

  /**
   * Notify admins if Duo account creation fails
   */
  static async notifyAdminOfFailure(adminEmails, operationType, organizationName, errorMessage) {
    try {
      await fetch('/api/v1/duo/notify-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_emails: adminEmails,
          operation_type: operationType,
          organization_name: organizationName,
          error_message: errorMessage
        })
      }).catch(e => console.log('[DuoPayment] Failure notification not critical:', e));
    } catch (err) {
      console.error('[DuoPayment] Error sending failure notification:', err);
    }
  }
}

console.log('[DuoPayment] Integration module loaded');
