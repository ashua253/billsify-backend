// routes/customer.js - Routes for customers to view their bills from affiliates
const express = require('express');
const router = express.Router();
const CustomerBill = require('../models/CustomerBill');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

// Get bills for customer (based on their phone number)
router.get('/my-bills', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get bills based on user's phone number
    if (!user.phoneNumber) {
      return res.json({ 
        bills: [],
        message: 'Please update your phone number in profile to view bills from merchants'
      });
    }

    const bills = await CustomerBill.getCustomerBills(user.phoneNumber);
    
    // Transform bills for frontend display
    const transformedBills = bills.map(bill => ({
      _id: bill._id,
      billNumber: bill.billNumber,
      merchantName: bill.affiliateId?.affiliateDetails?.organizationName || bill.affiliateId?.name || 'Unknown Merchant',
      items: bill.items,
      totalAmount: bill.totalAmount,
      discountAmount: bill.discountAmount,
      remarks: bill.remarks,
      billDate: bill.billDate,
      status: bill.status,
      paymentMethod: bill.paymentMethod,
      pdfPath: bill.pdfPath
    }));

    res.json({ bills: transformedBills });
  } catch (error) {
    console.error('❌ Get customer bills error:', error);
    res.status(500).json({ error: 'Failed to retrieve bills' });
  }
});

// Get single bill details for customer
router.get('/bills/:billId', authenticateToken, async (req, res) => {
  try {
    const { billId } = req.params;
    const user = await User.findById(req.user.userId);
    
    if (!user || !user.phoneNumber) {
      return res.status(400).json({ error: 'Phone number not found in profile' });
    }

    const bill = await CustomerBill.findOne({
      _id: billId,
      customerPhoneNumber: user.phoneNumber
    }).populate('affiliateId', 'name affiliateDetails');

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found or not authorized' });
    }

    res.json({ bill });
  } catch (error) {
    console.error('❌ Get bill details error:', error);
    res.status(500).json({ error: 'Failed to retrieve bill details' });
  }
});

// Update customer phone number
router.put('/profile/phone', authenticateToken, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ 
        error: 'Please enter a valid 10-digit mobile number starting with 6-9' 
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.phoneNumber = phoneNumber;
    await user.save();

    res.json({ 
      message: 'Phone number updated successfully',
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('❌ Update phone number error:', error);
    res.status(500).json({ error: 'Failed to update phone number' });
  }
});

module.exports = router;