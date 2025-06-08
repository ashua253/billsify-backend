// routes/bills.js - Fixed to properly create bills
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
      deviceName: bill.deviceName,
      deviceNumber: bill.deviceNumber,
      deviceCost: bill.deviceCost.toString(),
      remarks: bill.remarks || '',
      imageUri: bill.imageUri || null,
      submittedAt: bill.submittedAt || bill.date,
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

// POST /api/bills - Create a new bill - COMPLETELY FIXED
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('📥 Received bill data:', req.body);
    
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;

    // Extract data from both direct fields and frontendData
    const deviceName = frontendData?.deviceName || description || 'Unknown Device';
    const deviceNumber = frontendData?.deviceNumber || vendor || '';
    const deviceCost = frontendData?.deviceCost 
      ? parseFloat(frontendData.deviceCost) 
      : (amount || 0);
    const remarks = frontendData?.remarks || notes || '';
    const imageUri = frontendData?.imageUri || null;
    const submittedAt = frontendData?.submittedAt || date || new Date().toISOString();
    
    // Map 'other' to 'Other' for category enum
    const billCategory = category === 'other' ? 'Other' : (category || 'Other');

    console.log('🔍 Processed fields:', {
      deviceName,
      deviceNumber,
      deviceCost,
      remarks,
      billCategory
    });

    // Validation
    if (!deviceName || !deviceNumber || deviceCost <= 0) {
      console.log('❌ Validation failed:', { deviceName, deviceNumber, deviceCost });
      return res.status(400).json({ error: 'Device name, number, and valid cost are required' });
    }

    // Create bill with ALL required fields
    const bill = new Bill({
      userId: req.user.userId,
      
      // Frontend fields (required by model)
      deviceName: deviceName.trim(),
      deviceNumber: deviceNumber.trim(),
      deviceCost: deviceCost,
      remarks: remarks,
      imageUri: imageUri,
      submittedAt: new Date(submittedAt),
      
      // Backend fields (for compatibility)
      amount: deviceCost,
      description: deviceName.trim(),
      vendor: deviceNumber.trim(),
      notes: remarks,
      category: billCategory,
      date: new Date(submittedAt),
      
      // Store original frontend data
      frontendData: frontendData || {
        deviceName: deviceName,
        deviceNumber: deviceNumber,
        deviceCost: deviceCost.toString(),
        remarks: remarks,
        imageUri: imageUri,
        submittedAt: submittedAt
      }
    });

    console.log('💾 About to save bill with fields:', {
      deviceName: bill.deviceName,
      deviceNumber: bill.deviceNumber,
      deviceCost: bill.deviceCost,
      category: bill.category,
      amount: bill.amount,
      description: bill.description
    });

    const savedBill = await bill.save();
    console.log('✅ Bill saved successfully with ID:', savedBill._id);
    
    // Return transformed bill for frontend
    const transformedBill = {
      _id: savedBill._id,
      deviceName: savedBill.deviceName,
      deviceNumber: savedBill.deviceNumber,
      deviceCost: savedBill.deviceCost.toString(),
      remarks: savedBill.remarks,
      imageUri: savedBill.imageUri,
      submittedAt: savedBill.submittedAt,
      category: savedBill.category,
      amount: savedBill.amount,
      description: savedBill.description,
      date: savedBill.date,
      createdAt: savedBill.createdAt
    };
    
    res.status(201).json({ 
      message: 'Bill created successfully', 
      bill: transformedBill 
    });
  } catch (error) {
    console.error('❌ Create bill error:', error);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      console.log('❌ Validation errors:', errorMessages);
      return res.status(400).json({ error: `Validation failed: ${errorMessages.join(', ')}` });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/bills/:id - Update a bill
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, date, vendor, notes, frontendData } = req.body;
    
    // Find the bill first
    const bill = await Bill.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Update fields
    if (frontendData?.deviceName || description) {
      const newDeviceName = frontendData?.deviceName || description;
      bill.deviceName = newDeviceName;
      bill.description = newDeviceName;
    }
    
    if (frontendData?.deviceNumber || vendor) {
      const newDeviceNumber = frontendData?.deviceNumber || vendor;
      bill.deviceNumber = newDeviceNumber;
      bill.vendor = newDeviceNumber;
    }
    
    if (frontendData?.deviceCost || amount) {
      const newCost = frontendData?.deviceCost 
        ? parseFloat(frontendData.deviceCost) 
        : amount;
      bill.deviceCost = newCost;
      bill.amount = newCost;
    }
    
    if (frontendData?.remarks || notes !== undefined) {
      const newRemarks = frontendData?.remarks || notes || '';
      bill.remarks = newRemarks;
      bill.notes = newRemarks;
    }
    
    if (frontendData?.imageUri !== undefined) {
      bill.imageUri = frontendData.imageUri;
    }
    
    if (category) {
      bill.category = category === 'other' ? 'Other' : category;
    }
    
    if (frontendData?.submittedAt || date) {
      const newDate = new Date(frontendData?.submittedAt || date);
      bill.submittedAt = newDate;
      bill.date = newDate;
    }
    
    // Update frontendData
    if (frontendData) {
      bill.frontendData = frontendData;
    }

    const updatedBill = await bill.save();

    // Return transformed bill
    const transformedBill = {
      _id: updatedBill._id,
      deviceName: updatedBill.deviceName,
      deviceNumber: updatedBill.deviceNumber,
      deviceCost: updatedBill.deviceCost.toString(),
      remarks: updatedBill.remarks,
      imageUri: updatedBill.imageUri,
      submittedAt: updatedBill.submittedAt,
      category: updatedBill.category,
      amount: updatedBill.amount,
      description: updatedBill.description,
      date: updatedBill.date,
      createdAt: updatedBill.createdAt
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

// GET /api/bills/search - Search bills
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, startDate, endDate } = req.query;
    let searchCriteria = { userId: req.user.userId };

    if (query) {
      searchCriteria.$or = [
        { deviceName: { $regex: query, $options: 'i' } },
        { deviceNumber: { $regex: query, $options: 'i' } },
        { remarks: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { vendor: { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      const searchCategory = category === 'other' ? 'Other' : category;
      searchCriteria.category = searchCategory;
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
      deviceName: bill.deviceName,
      deviceNumber: bill.deviceNumber,
      deviceCost: bill.deviceCost.toString(),
      remarks: bill.remarks,
      imageUri: bill.imageUri,
      submittedAt: bill.submittedAt,
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