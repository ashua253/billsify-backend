// routes/bills.js - Fixed validation logic
const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const authenticateToken = require('../middleware/auth');

// GET /api/bills - Get all bills for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    
    // Transform bills for frontend compatibility
    const transformedBills = bills.map(bill => ({
      _id: bill._id,
      deviceName: bill.frontendData?.deviceName || bill.description,
      deviceNumber: bill.frontendData?.deviceNumber || bill.vendor,
      deviceCost: bill.frontendData?.deviceCost || bill.amount.toString(),
      remarks: bill.frontendData?.remarks || bill.notes,
      imageUri: bill.frontendData?.imageUri || null,
      submittedAt: bill.frontendData?.submittedAt || bill.date,
      // Keep backend fields for compatibility
      category: bill.category,
      amount: bill.amount,
      description: bill.description,
      date: bill.date,
      createdAt: bill.createdAt
    }));
    
    res.json({ bills: transformedBills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bills - Create a new bill - FIXED VERSION
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('📥 Received bill data:', req.body); // Debug log
    
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;

    // Handle both frontend and backend data structures
    const billAmount = amount || (frontendData?.deviceCost ? parseFloat(frontendData.deviceCost) : 0);
    const billDescription = description || frontendData?.deviceName || 'Unknown Device';
    const billDate = date || frontendData?.submittedAt || new Date().toISOString();

    console.log('🔍 Processed fields:', { billAmount, billDescription, billDate }); // Debug log

    // FIXED VALIDATION - Check the processed values, not the original fields
    if (!billDescription || billAmount <= 0) {
      console.log('❌ Validation failed:', { billDescription, billAmount });
      return res.status(400).json({ error: 'Description and valid amount are required' });
    }

    const bill = new Bill({
      userId: req.user.userId,
      category: category || 'other',
      amount: billAmount,
      description: billDescription,
      date: new Date(billDate),
      vendor: vendor || frontendData?.deviceNumber || '',
      notes: notes || frontendData?.remarks || '',
      frontendData: frontendData || {
        deviceName: billDescription,
        deviceNumber: vendor || '',
        deviceCost: billAmount.toString(),
        remarks: notes || '',
        imageUri: null,
        submittedAt: billDate
      }
    });

    console.log('💾 Saving bill:', bill); // Debug log

    await bill.save();
    
    // Return transformed bill for frontend
    const transformedBill = {
      _id: bill._id,
      deviceName: bill.frontendData?.deviceName || bill.description,
      deviceNumber: bill.frontendData?.deviceNumber || bill.vendor,
      deviceCost: bill.frontendData?.deviceCost || bill.amount.toString(),
      remarks: bill.frontendData?.remarks || bill.notes,
      imageUri: bill.frontendData?.imageUri || null,
      submittedAt: bill.frontendData?.submittedAt || bill.date,
      category: bill.category,
      amount: bill.amount,
      description: bill.description,
      date: bill.date,
      createdAt: bill.createdAt
    };
    
    console.log('✅ Bill created successfully:', transformedBill._id);
    
    res.status(201).json({ 
      message: 'Bill created successfully', 
      bill: transformedBill 
    });
  } catch (error) {
    console.error('❌ Create bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/bills/:id - Update a bill
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;
    
    const updateData = {
      category: category || 'other',
      amount: amount || (frontendData?.deviceCost ? parseFloat(frontendData.deviceCost) : 0),
      description: description || frontendData?.deviceName || 'Unknown Device',
      date: new Date(date || frontendData?.submittedAt || new Date()),
      vendor: vendor || frontendData?.deviceNumber || '',
      notes: notes || frontendData?.remarks || '',
      frontendData: frontendData
    };
    
    const bill = await Bill.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateData,
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Return transformed bill for frontend
    const transformedBill = {
      _id: bill._id,
      deviceName: bill.frontendData?.deviceName || bill.description,
      deviceNumber: bill.frontendData?.deviceNumber || bill.vendor,
      deviceCost: bill.frontendData?.deviceCost || bill.amount.toString(),
      remarks: bill.frontendData?.remarks || bill.notes,
      imageUri: bill.frontendData?.imageUri || null,
      submittedAt: bill.frontendData?.submittedAt || bill.date,
      category: bill.category,
      amount: bill.amount,
      description: bill.description,
      date: bill.date,
      createdAt: bill.createdAt
    };

    res.json({ 
      message: 'Bill updated successfully', 
      bill: transformedBill 
    });
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/bills/:id - Delete a bill
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const bill = await Bill.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bills/search - Search bills with frontend compatibility
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, startDate, endDate } = req.query;
    let searchCriteria = { userId: req.user.userId };

    if (query) {
      searchCriteria.$or = [
        { description: { $regex: query, $options: 'i' } },
        { vendor: { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } },
        { 'frontendData.deviceName': { $regex: query, $options: 'i' } },
        { 'frontendData.deviceNumber': { $regex: query, $options: 'i' } },
        { 'frontendData.remarks': { $regex: query, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      searchCriteria.category = category;
    }

    if (startDate && endDate) {
      searchCriteria.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const bills = await Bill.find(searchCriteria).sort({ createdAt: -1 });
    
    // Transform bills for frontend compatibility
    const transformedBills = bills.map(bill => ({
      _id: bill._id,
      deviceName: bill.frontendData?.deviceName || bill.description,
      deviceNumber: bill.frontendData?.deviceNumber || bill.vendor,
      deviceCost: bill.frontendData?.deviceCost || bill.amount.toString(),
      remarks: bill.frontendData?.remarks || bill.notes,
      imageUri: bill.frontendData?.imageUri || null,
      submittedAt: bill.frontendData?.submittedAt || bill.date,
      category: bill.category,
      amount: bill.amount,
      description: bill.description,
      date: bill.date,
      createdAt: bill.createdAt
    }));
    
    res.json({ bills: transformedBills });
  } catch (error) {
    console.error('Search bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bills/stats - Get bills statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId });
    
    const stats = {
      totalBills: bills.length,
      totalAmount: bills.reduce((sum, bill) => sum + bill.amount, 0),
      categoryBreakdown: {},
      monthlySpending: {}
    };

    // Calculate category breakdown
    bills.forEach(bill => {
      if (stats.categoryBreakdown[bill.category]) {
        stats.categoryBreakdown[bill.category] += bill.amount;
      } else {
        stats.categoryBreakdown[bill.category] = bill.amount;
      }
    });

    res.json({ stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;