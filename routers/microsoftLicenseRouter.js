const express = require('express');
const router = express.Router();
const microsoftLicenseApi = require('../utils/microsoftLicenseApi');
const catchAsync = require('../utils/catchAsync');

router.get('/licenses', async (req, res) => {
  const products = typeof req.query.products === 'string' && req.query.products.trim()
    ? req.query.products.split(',').map(item => item.trim()).filter(Boolean)
    : undefined;

  try {
    const catalog = await microsoftLicenseApi.listMicrosoftLicenses({
      offset: req.query.offset,
      max: req.query.max,
      yearMonth: req.query.yearMonth,
      products
    });

    res.status(200).json({
      status: 'success',
      data: catalog
    });
  } catch (error) {
    res.status(502).json({
      status: 'error',
      message: error.message || 'Live Microsoft license data unavailable'
    });
  }
});

router.get('/token-status', catchAsync(async (req, res) => {
  try {
    await microsoftLicenseApi.getAccessToken();
    res.status(200).json({ status: 'success', configured: true });
  } catch (error) {
    res.status(200).json({
      status: 'success',
      configured: false,
      message: error.message
    });
  }
}));

module.exports = router;
