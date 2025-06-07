// routes/bills.js - Fixed version with proper imports
const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const authenticateToken = require('../middleware/auth'); // Fixed import

// GET /api/bills - Get all bills for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/bills - Create a new bill
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      deviceName,
      deviceNumber,
      deviceCost,
      amount,
      remarks,
      imageUri,
      category,
      date,
      frontendData
    } = req.body;

    // Validation
    if (!deviceName || !deviceNumber || (!deviceCost && !amount)) {
      return res.status(400).json({ 
        message: 'Device name, number, and cost are required' 
      });
    }

    const billAmount = amount || deviceCost;
    if (isNaN(billAmount) || billAmount <= 0) {
      return res.status(400).json({ 
        message: 'Please provide a valid amount' 
      });
    }

    const bill = new Bill({
      userId: req.user.userId, // From JWT middleware
      deviceName: deviceName.trim(),
      deviceNumber: deviceNumber.trim(),
      deviceCost: parseFloat(billAmount),
      amount: parseFloat(billAmount),
      remarks: remarks ? remarks.trim() : '',
      imageUri: imageUri || null,
      category: category || 'General',
      date: date ? new Date(date) : new Date(),
      // Store frontend-specific data
      frontendData: frontendData || {
        deviceName: deviceName.trim(),
        deviceNumber: deviceNumber.trim(),
        deviceCost: billAmount.toString(),
        remarks: remarks || '',
        imageUri: imageUri || null,
        submittedAt: new Date().toISOString()
      }
    });

    const savedBill = await bill.save();
    res.status(201).json({ 
      message: 'Bill created successfully', 
      bill: savedBill 
    });
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/bills/:id - Update a bill
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      deviceName,
      deviceNumber,
      deviceCost,
      amount,
      remarks,
      imageUri,
      category,
      date,
      frontendData
    } = req.body;

    // Find bill and verify ownership
    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    if (bill.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
    if (deviceName) bill.deviceName = deviceName.trim();
    if (deviceNumber) bill.deviceNumber = deviceNumber.trim();
    
    const billAmount = amount || deviceCost;
    if (billAmount && !isNaN(billAmount) && billAmount > 0) {
      bill.deviceCost = parseFloat(billAmount);
      bill.amount = parseFloat(billAmount);
    }
    
    if (remarks !== undefined) bill.remarks = remarks.trim();
    if (imageUri !== undefined) bill.imageUri = imageUri;
    if (category) bill.category = category;
    if (date) bill.date = new Date(date);
    if (frontendData) bill.frontendData = frontendData;

    const updatedBill = await bill.save();
    res.json({ 
      message: 'Bill updated successfully', 
      bill: updatedBill 
    });
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/bills/:id - Delete a bill
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Find bill and verify ownership
    const bill = await Bill.findById(id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    if (bill.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Bill.findByIdAndDelete(id);
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/bills/search - Search bills
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, startDate, endDate } = req.query;
    let searchCriteria = { userId: req.user.userId };

    // Text search
    if (query) {
      searchCriteria.$or = [
        { deviceName: { $regex: query, $options: 'i' } },
        { deviceNumber: { $regex: query, $options: 'i' } },
        { remarks: { $regex: query, $options: 'i' } },
        { 'frontendData.deviceName': { $regex: query, $options: 'i' } },
        { 'frontendData.deviceNumber': { $regex: query, $options: 'i' } },
        { 'frontendData.remarks': { $regex: query, $options: 'i' } }
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      searchCriteria.category = category;
    }

    // Date range filter
    if (startDate || endDate) {
      searchCriteria.date = {};
      if (startDate) {
        searchCriteria.date.$gte = new Date(startDate);
      }
      if (endDate) {
        searchCriteria.date.$lte = new Date(endDate);
      }
    }

    const bills = await Bill.find(searchCriteria).sort({ createdAt: -1 });
    res.json({ bills });
  } catch (error) {
    console.error('Search bills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/bills/stats - Get bill statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ userId: req.user.userId });
    
    // Calculate totals by category
    const categoryTotals = {};
    let totalAmount = 0;
    
    bills.forEach(bill => {
      const category = bill.category || 'General';
      const amount = bill.amount || bill.deviceCost || 0;
      
      if (categoryTotals[category]) {
        categoryTotals[category] += amount;
      } else {
        categoryTotals[category] = amount;
      }
      
      totalAmount += amount;
    });

    // Calculate monthly totals
    const monthlyTotals = {};
    bills.forEach(bill => {
      const date = new Date(bill.date || bill.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const amount = bill.amount || bill.deviceCost || 0;
      
      if (monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] += amount;
      } else {
        monthlyTotals[monthKey] = amount;
      }
    });

    res.json({
      stats: {
        totalBills: bills.length,
        totalAmount,
        categoryTotals,
        monthlyTotals,
        averageAmount: bills.length > 0 ? totalAmount / bills.length : 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;