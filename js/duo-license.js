/**
 * Duo License Frontend Module
 * Handles UI and API interactions for Duo license purchasing
 */

class DuoLicenseManager {
  constructor() {
    this.user = null;
    this.duoAccount = null;
    this.isUpgradeMode = false;
    this.init();
  }

  async init() {
    // Get user from localStorage
    this.user = JSON.parse(localStorage.getItem('user'));
    
    if (this.user) {
      await this.checkExistingAccount();
      this.setupEventListeners();
    }
  }

  /**
   * Check if user already has a Duo account
   */
  async checkExistingAccount() {
    try {
      const response = await fetch(`/api/v1/duo/${this.user.userID}`);
      if (response.ok) {
        this.duoAccount = await response.json();
        this.duoAccount = this.duoAccount.data;
        this.isUpgradeMode = true;
      }
    } catch (error) {
      console.log('No existing Duo account found');
      this.isUpgradeMode = false;
    }
  }

  setupEventListeners() {
    const purchaseBtn = document.getElementById('duoPurchaseBtn');
    const upgradeBtn = document.getElementById('duoUpgradeBtn');
    const submitBtn = document.getElementById('duoSubmitBtn');
    const modal = document.getElementById('duoLicenseModal');
    const closeBtn = document.getElementById('duoModalClose');

    if (purchaseBtn) {
      purchaseBtn.addEventListener('click', () => this.openPurchaseModal());
    }

    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => this.openUpgradeModal());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit());
    }

    // Close modal when clicking outside
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      });
    }
  }

  /**
   * Open purchase modal for new Duo accounts
   */
  openPurchaseModal() {
    this.isUpgradeMode = false;
    const modal = document.getElementById('duoLicenseModal');
    const title = document.getElementById('duoModalTitle');
    const description = document.getElementById('duoModalDescription');
    const accountNameGroup = document.getElementById('duoAccountNameGroup');
    const submitBtn = document.getElementById('duoSubmitBtn');

    title.textContent = 'Purchase Duo Licenses';
    description.textContent = 'Create a new Duo account and select your license count.';
    accountNameGroup.style.display = 'block';
    submitBtn.textContent = 'Purchase Licenses';

    // Clear form
    document.getElementById('duoAccountName').value = '';
    document.getElementById('duoLicenseCount').value = '1';
    document.getElementById('duoAdditionalLicenses').value = '1';

    modal.style.display = 'flex';
  }

  /**
   * Open upgrade modal for existing Duo accounts
   */
  openUpgradeModal() {
    this.isUpgradeMode = true;
    const modal = document.getElementById('duoLicenseModal');
    const title = document.getElementById('duoModalTitle');
    const description = document.getElementById('duoModalDescription');
    const accountNameGroup = document.getElementById('duoAccountNameGroup');
    const submitBtn = document.getElementById('duoSubmitBtn');
    const accountInfo = document.getElementById('duoAccountInfo');

    title.textContent = 'Upgrade Duo Licenses';
    description.textContent = `Current licenses: ${this.duoAccount.numLicenses}. Add more licenses to increase your user limit.`;
    accountNameGroup.style.display = 'none';
    submitBtn.textContent = 'Upgrade Licenses';

    if (accountInfo) {
      accountInfo.innerHTML = `
        <p><strong>Account Name:</strong> ${this.duoAccount.accountName}</p>
        <p><strong>Current Licenses:</strong> ${this.duoAccount.numLicenses}</p>
      `;
      accountInfo.style.display = 'block';
    }

    document.getElementById('duoAdditionalLicenses').value = '1';
    modal.style.display = 'flex';
  }

  /**
   * Close the modal
   */
  closeModal() {
    const modal = document.getElementById('duoLicenseModal');
    modal.style.display = 'none';
  }

  /**
   * Handle form submission
   */
  async handleSubmit() {
    const submitBtn = document.getElementById('duoSubmitBtn');
    
    // Disable button during submission
    submitBtn.disabled = true;
    submitBtn.textContent = this.isUpgradeMode ? 'Upgrading...' : 'Processing...';

    try {
      if (this.isUpgradeMode) {
        await this.handleUpgrade();
      } else {
        await this.handlePurchase();
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
      console.error(error);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.isUpgradeMode ? 'Upgrade Licenses' : 'Purchase Licenses';
    }
  }

  /**
   * Handle new Duo license purchase
   */
  async handlePurchase() {
    const accountName = document.getElementById('duoAccountName').value.trim();
    const numLicenses = parseInt(document.getElementById('duoLicenseCount').value);

    if (!accountName) {
      throw new Error('Please enter an account name');
    }

    if (numLicenses < 1) {
      throw new Error('Please select at least 1 license');
    }

    // Store purchase details in sessionStorage to pass to payment
    const purchaseData = {
      type: 'duo_purchase',
      accountName,
      numLicenses,
      timestamp: Date.now()
    };

    sessionStorage.setItem('duoPurchaseData', JSON.stringify(purchaseData));

    // Close modal and navigate to cart/checkout
    this.closeModal();
    alert(`Duo license purchase initialization started.\nAccount: ${accountName}\nLicenses: ${numLicenses}\n\nProceeding to checkout...`);
    window.location.href = '/cart.html';
  }

  /**
   * Handle Duo license upgrade
   */
  async handleUpgrade() {
    const additionalLicenses = parseInt(document.getElementById('duoAdditionalLicenses').value);

    if (additionalLicenses < 1) {
      throw new Error('Please select at least 1 additional license');
    }

    // Store upgrade details in sessionStorage
    const upgradeData = {
      type: 'duo_upgrade',
      additionalLicenses,
      currentLicenses: this.duoAccount.numLicenses,
      newTotal: this.duoAccount.numLicenses + additionalLicenses,
      timestamp: Date.now()
    };

    sessionStorage.setItem('duoUpgradeData', JSON.stringify(upgradeData));

    // Close modal and navigate to cart/checkout
    this.closeModal();
    alert(`Duo license upgrade initialization started.\nAdditional licenses: ${additionalLicenses}\nNew total: ${upgradeData.newTotal}\n\nProceeding to checkout...`);
    window.location.href = '/cart.html';
  }

  /**
   * Initialize Duo license purchase after payment
   * Call this after successful payment
   */
  static async finalizePurchaseAfterPayment(userID, orderID, paymentReference) {
    const purchaseData = JSON.parse(sessionStorage.getItem('duoPurchaseData'));
    
    if (!purchaseData) {
      console.error('No Duo purchase data found in sessionStorage');
      return false;
    }

    try {
      const response = await fetch('/api/v1/duo/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userID,
          accountName: purchaseData.accountName,
          numLicenses: purchaseData.numLicenses,
          orderID,
          paymentReference
        })
      });

      const result = await response.json();

      if (response.ok) {
        sessionStorage.removeItem('duoPurchaseData');
        console.log('Duo account created successfully:', result.data);
        return true;
      } else {
        throw new Error(result.message || 'Failed to create Duo account');
      }
    } catch (error) {
      console.error('Error finalizing Duo purchase:', error);
      throw error;
    }
  }

  /**
   * Initialize Duo license upgrade after payment
   * Call this after successful payment
   */
  static async finalizeUpgradeAfterPayment(userID, orderID, paymentReference) {
    const upgradeData = JSON.parse(sessionStorage.getItem('duoUpgradeData'));
    
    if (!upgradeData) {
      console.error('No Duo upgrade data found in sessionStorage');
      return false;
    }

    try {
      const response = await fetch('/api/v1/duo/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userID,
          additionalLicenses: upgradeData.additionalLicenses,
          orderID,
          paymentReference
        })
      });

      const result = await response.json();

      if (response.ok) {
        sessionStorage.removeItem('duoUpgradeData');
        console.log('Duo account upgraded successfully:', result.data);
        return true;
      } else {
        throw new Error(result.message || 'Failed to upgrade Duo account');
      }
    } catch (error) {
      console.error('Error finalizing Duo upgrade:', error);
      throw error;
    }
  }

  /**
   * Get user's Duo license info (if any)
   */
  static async getUserDuoInfo(userID) {
    try {
      const response = await fetch(`/api/v1/duo/${userID}`);
      if (response.ok) {
        const result = await response.json();
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching Duo info:', error);
      return null;
    }
  }

  /**
   * Get user's Duo license purchase history
   */
  static async getUserDuoHistory(userID) {
    try {
      const response = await fetch(`/api/v1/duo/history/${userID}`);
      if (response.ok) {
        const result = await response.json();
        return result.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching Duo history:', error);
      return [];
    }
  }
}

// Initialize Duo License Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.duoLicenseManager = new DuoLicenseManager();
});
