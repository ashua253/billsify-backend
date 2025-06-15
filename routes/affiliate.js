// routes/affiliate.js - UPDATED: Enhanced affiliate routes with item-level discounts
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const CustomerBill = require('../models/CustomerBill');
const authenticateToken = require('../middleware/auth');

// Middleware to check if user is an approved affiliate
const checkAffiliate = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.userType !== 'affiliate' || user.status !== 'active') {
      return res.status(403).json({ error: 'Access denied. Approved affiliate required.' });
    }
    req.affiliate = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// ============ INVENTORY MANAGEMENT ROUTES ============

// Get all inventory items for affiliate
router.get('/inventory', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { search, category, lowStock } = req.query;
    
    let query = { 
      affiliateId: req.user.userId,
      isActive: true
    };

    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemDescription: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.category = category;
    }

    let inventory = await Inventory.find(query).sort({ itemName: 1 });

    if (lowStock === 'true') {
      inventory = inventory.filter(item => item.isLowStock());
    }

    res.json({ inventory });
  } catch (error) {
    console.error('❌ Get inventory error:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory' });
  }
});

// Add new inventory item
router.post('/inventory', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const {
      itemName,
      itemDescription,
      category,
      unitPrice,
      availableQuantity,
      minimumStockLevel,
      unit,
      sku
    } = req.body;

    // Validation
    if (!itemName || !unitPrice || availableQuantity === undefined) {
      return res.status(400).json({ 
        error: 'Item name, unit price, and available quantity are required' 
      });
    }

    if (unitPrice < 0 || availableQuantity < 0) {
      return res.status(400).json({ error: 'Price and quantity cannot be negative' });
    }

    // Check if item already exists for this affiliate
    const existingItem = await Inventory.findOne({
      affiliateId: req.user.userId,
      itemName: itemName.trim(),
      isActive: true
    });

    if (existingItem) {
      return res.status(400).json({ error: 'Item with this name already exists' });
    }

    const inventoryItem = new Inventory({
      affiliateId: req.user.userId,
      itemName: itemName.trim(),
      itemDescription: itemDescription?.trim() || '',
      category: category?.trim() || 'General',
      unitPrice: parseFloat(unitPrice),
      availableQuantity: parseInt(availableQuantity),
      minimumStockLevel: minimumStockLevel ? parseInt(minimumStockLevel) : 5,
      unit: unit?.trim() || 'pcs',
      sku: sku?.trim() || ''
    });

    const savedItem = await inventoryItem.save();
    res.status(201).json({
      message: 'Inventory item added successfully',
      item: savedItem
    });
  } catch (error) {
    console.error('❌ Add inventory error:', error);
    res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

// Update inventory item
router.put('/inventory/:itemId', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { itemId } = req.params;
    const updates = req.body;

    const item = await Inventory.findOne({
      _id: itemId,
      affiliateId: req.user.userId
    });

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Update allowed fields (itemName is NOT allowed to be updated)
    const allowedUpdates = [
      'itemDescription', 'category', 'unitPrice', 
      'availableQuantity', 'minimumStockLevel', 'unit', 'sku'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        item[field] = updates[field];
      }
    });

    const updatedItem = await item.save();
    res.json({
      message: 'Inventory item updated successfully',
      item: updatedItem
    });
  } catch (error) {
    console.error('❌ Update inventory error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete inventory item
router.delete('/inventory/:itemId', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Inventory.findOne({
      _id: itemId,
      affiliateId: req.user.userId
    });

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check if item has stock - cannot delete if stock > 0
    if (item.availableQuantity > 0) {
      return res.status(400).json({ 
        error: `Cannot delete item "${item.itemName}" because it has ${item.availableQuantity} ${item.unit} in stock. Please reduce stock to 0 before deleting.` 
      });
    }

    // Soft delete
    item.isActive = false;
    await item.save();

    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('❌ Delete inventory error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Search inventory items (for autocomplete)
router.get('/inventory/search', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ items: [] });
    }

    const items = await Inventory.searchItems(req.user.userId, q);
    res.json({ items });
  } catch (error) {
    console.error('❌ Search inventory error:', error);
    res.status(500).json({ error: 'Failed to search inventory' });
  }
});

// ============ CUSTOMER BILL ROUTES ============

// UPDATED: Create customer bill with item-level discounts
router.post('/bills', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const {
      customerPhoneNumber,
      customerName,
      items,
      discountAmount,
      remarks,
      paymentMethod
    } = req.body;

    console.log('📥 Creating bill with data:', {
      customerPhoneNumber,
      itemCount: items?.length,
      hasInventoryManagement: req.affiliate.affiliateDetails?.requiresInventoryManagement
    });

    // Validation
    if (!customerPhoneNumber || !items || items.length === 0) {
      return res.status(400).json({ 
        error: 'Customer phone number and items are required' 
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(customerPhoneNumber)) {
      return res.status(400).json({ 
        error: 'Please enter a valid 10-digit mobile number' 
      });
    }

    // Validate items
    for (let item of items) {
      if (!item.itemName || !item.quantity || !item.unitPrice) {
        return res.status(400).json({ 
          error: 'Each item must have name, quantity, and unit price' 
        });
      }
      if (parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) < 0) {
        return res.status(400).json({ 
          error: 'Quantity must be positive and price cannot be negative' 
        });
      }
      if (item.discount && parseFloat(item.discount) < 0) {
        return res.status(400).json({ 
          error: 'Discount cannot be negative' 
        });
      }
    }

    // Check inventory availability if affiliate uses inventory management
    if (req.affiliate.affiliateDetails?.requiresInventoryManagement) {
      for (let item of items) {
        if (item.inventoryItemId) {
          const inventoryItem = await Inventory.findById(item.inventoryItemId);
          if (!inventoryItem || inventoryItem.availableQuantity < parseFloat(item.quantity)) {
            return res.status(400).json({ 
              error: `Insufficient stock for ${item.itemName}. Available: ${inventoryItem?.availableQuantity || 0}` 
            });
          }
        }
      }
    }

    // UPDATED: Process items with individual discounts
    const processedItems = items.map(item => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const itemDiscount = parseFloat(item.discount || 0);
      const grossAmount = quantity * unitPrice;
      const netAmount = Math.max(0, grossAmount - itemDiscount);

      return {
        itemName: item.itemName.trim(),
        quantity: quantity,
        unitPrice: unitPrice,
        discount: itemDiscount,
        totalPrice: netAmount,
        inventoryItemId: item.inventoryItemId || null
      };
    });

    console.log('📊 Processed items:', processedItems.map(item => ({
      name: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      totalPrice: item.totalPrice
    })));

    // Create customer bill
    const customerBill = new CustomerBill({
      affiliateId: req.user.userId,
      customerPhoneNumber: customerPhoneNumber.trim(),
      customerName: customerName?.trim() || '',
      items: processedItems,
      discountAmount: parseFloat(discountAmount || 0),
      remarks: remarks?.trim() || '',
      paymentMethod: paymentMethod || 'pending',
      status: 'sent'
    });

    const savedBill = await customerBill.save();

    console.log('✅ Bill created successfully:', {
      billNumber: savedBill.billNumber,
      subtotal: savedBill.subtotal,
      totalItemDiscounts: savedBill.totalItemDiscounts,
      additionalDiscount: savedBill.discountAmount,
      finalTotal: savedBill.totalAmount
    });

    // Update inventory if needed
    if (req.affiliate.affiliateDetails?.requiresInventoryManagement) {
      for (let item of processedItems) {
        if (item.inventoryItemId) {
          const inventoryItem = await Inventory.findById(item.inventoryItemId);
          if (inventoryItem) {
            await inventoryItem.updateStock(item.quantity);
            console.log(`📦 Updated inventory for ${inventoryItem.itemName}: ${inventoryItem.availableQuantity} remaining`);
          }
        }
      }
    }

    // Generate PDF (placeholder for now)
    await savedBill.generatePDF();

    // Send WhatsApp (placeholder for now)
    await savedBill.sendWhatsApp();

    // Return bill with breakdown
    const billBreakdown = savedBill.getBillBreakdown();

    res.status(201).json({
      message: 'Customer bill created successfully',
      bill: {
        ...savedBill.toObject(),
        breakdown: billBreakdown
      }
    });
  } catch (error) {
    console.error('❌ Create customer bill error:', error);
    res.status(500).json({ 
      error: 'Failed to create customer bill',
      details: error.message 
    });
  }
});

// Get affiliate's bills
router.get('/bills', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate, 
      status,
      customerPhone 
    } = req.query;

    let query = { affiliateId: req.user.userId };

    if (startDate && endDate) {
      query.billDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (status) {
      query.status = status;
    }

    if (customerPhone) {
      query.customerPhoneNumber = { $regex: customerPhone, $options: 'i' };
    }

    const bills = await CustomerBill.find(query)
      .sort({ billDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CustomerBill.countDocuments(query);

    res.json({
      bills,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBills: total
      }
    });
  } catch (error) {
    console.error('❌ Get bills error:', error);
    res.status(500).json({ error: 'Failed to retrieve bills' });
  }
});

// Get single bill details with breakdown
router.get('/bills/:billId', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { billId } = req.params;

    const bill = await CustomerBill.findOne({
      _id: billId,
      affiliateId: req.user.userId
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Include bill breakdown
    const breakdown = bill.getBillBreakdown();

    res.json({ 
      bill: {
        ...bill.toObject(),
        breakdown: breakdown
      }
    });
  } catch (error) {
    console.error('❌ Get bill details error:', error);
    res.status(500).json({ error: 'Failed to retrieve bill details' });
  }
});

// ============ DASHBOARD & REPORTS ROUTES ============

// UPDATED: Get affiliate dashboard data with discount insights
router.get('/dashboard', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get sales summary with discount breakdown
    const salesSummary = await CustomerBill.getAffiliateSales(
      req.user.userId, 
      startDate, 
      new Date()
    );

    // Get inventory summary
    const inventoryStats = await Inventory.aggregate([
      { $match: { affiliateId: req.user.userId, isActive: true } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$availableQuantity', '$unitPrice'] } },
          lowStockItems: {
            $sum: {
              $cond: [{ $lte: ['$availableQuantity', '$minimumStockLevel'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Get recent bills
    const recentBills = await CustomerBill.find({
      affiliateId: req.user.userId
    })
    .sort({ billDate: -1 })
    .limit(5);

    // Get low stock items
    const lowStockItems = await Inventory.getLowStockItems(req.user.userId);

    res.json({
      salesSummary: salesSummary[0] || {
        totalBills: 0,
        totalRevenue: 0,
        totalItemDiscounts: 0,
        totalAdditionalDiscounts: 0,
        totalDiscounts: 0
      },
      inventoryStats: inventoryStats[0] || {
        totalItems: 0,
        totalValue: 0,
        lowStockItems: 0
      },
      recentBills,
      lowStockItems,
      period: parseInt(period)
    });
  } catch (error) {
    console.error('❌ Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

// UPDATED: Get sales report with discount analysis
router.get('/reports/sales', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Start date and end date are required' 
      });
    }

    const matchQuery = {
      affiliateId: req.user.userId,
      status: { $ne: 'cancelled' },
      billDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    let groupFormat;
    switch (groupBy) {
      case 'month':
        groupFormat = { $dateToString: { format: "%Y-%m", date: "$billDate" } };
        break;
      case 'week':
        groupFormat = { $dateToString: { format: "%Y-W%U", date: "$billDate" } };
        break;
      default: // day
        groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$billDate" } };
    }

    const salesReport = await CustomerBill.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: groupFormat,
          totalBills: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          totalItemDiscounts: { $sum: '$totalItemDiscounts' },
          totalAdditionalDiscounts: { $sum: '$discountAmount' },
          totalDiscounts: { $sum: { $add: ['$totalItemDiscounts', '$discountAmount'] } },
          uniqueCustomers: { $addToSet: '$customerPhoneNumber' }
        }
      },
      {
        $addFields: {
          uniqueCustomerCount: { $size: '$uniqueCustomers' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ salesReport });
  } catch (error) {
    console.error('❌ Get sales report error:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// NEW: Get discount analysis report
router.get('/reports/discounts', authenticateToken, checkAffiliate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Start date and end date are required' 
      });
    }

    const discountAnalysis = await CustomerBill.getDiscountAnalysis(
      req.user.userId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({ discountAnalysis });
  } catch (error) {
    console.error('❌ Get discount analysis error:', error);
    res.status(500).json({ error: 'Failed to generate discount analysis' });
  }
});

module.exports = router;