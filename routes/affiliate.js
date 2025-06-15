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

// FIXED: Create customer bill with enhanced error handling and validation
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
      customerName,
      itemCount: items?.length,
      discountAmount,
      hasInventoryManagement: req.affiliate.affiliateDetails?.requiresInventoryManagement
    });

    // Enhanced validation
    if (!customerPhoneNumber || !customerPhoneNumber.trim()) {
      return res.status(400).json({ 
        error: 'Customer phone number is required' 
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'At least one item is required' 
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(customerPhoneNumber.trim())) {
      return res.status(400).json({ 
        error: 'Please enter a valid 10-digit mobile number' 
      });
    }

    // Enhanced item validation
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (!item.itemName || !item.itemName.trim()) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Item name is required` 
        });
      }
      
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const discount = parseFloat(item.discount || 0);
      
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Quantity must be greater than 0` 
        });
      }
      
      if (isNaN(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Unit price cannot be negative` 
        });
      }
      
      if (isNaN(discount) || discount < 0) {
        return res.status(400).json({ 
          error: `Item ${i + 1}: Discount cannot be negative` 
        });
      }
    }

    // Check inventory availability if affiliate uses inventory management
    if (req.affiliate.affiliateDetails?.requiresInventoryManagement) {
      console.log('🔍 Checking inventory availability...');
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.inventoryItemId) {
          try {
            const inventoryItem = await Inventory.findById(item.inventoryItemId);
            
            if (!inventoryItem) {
              return res.status(400).json({ 
                error: `Item "${item.itemName}" not found in inventory` 
              });
            }
            
            if (inventoryItem.availableQuantity < parseFloat(item.quantity)) {
              return res.status(400).json({ 
                error: `Insufficient stock for ${item.itemName}. Available: ${inventoryItem.availableQuantity} ${inventoryItem.unit}, Requested: ${item.quantity}` 
              });
            }
            
            console.log(`✅ Inventory check passed for ${item.itemName}: ${inventoryItem.availableQuantity} available, ${item.quantity} requested`);
          } catch (invError) {
            console.error('❌ Inventory check error:', invError);
            return res.status(400).json({ 
              error: `Failed to verify inventory for ${item.itemName}` 
            });
          }
        }
      }
    }

    // ENHANCED: Process items with validation and proper number conversion
    const processedItems = items.map((item, index) => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const itemDiscount = parseFloat(item.discount || 0);
      const grossAmount = quantity * unitPrice;
      const netAmount = Math.max(0, grossAmount - itemDiscount);

      const processedItem = {
        itemName: item.itemName.trim(),
        quantity: quantity,
        unitPrice: unitPrice,
        discount: itemDiscount,
        totalPrice: netAmount,
        inventoryItemId: item.inventoryItemId || null
      };

      console.log(`📊 Processed item ${index + 1}:`, {
        name: processedItem.itemName,
        quantity: processedItem.quantity,
        unitPrice: processedItem.unitPrice,
        discount: processedItem.discount,
        totalPrice: processedItem.totalPrice
      });

      return processedItem;
    });

    // Validate discount amount
    const additionalDiscount = parseFloat(discountAmount || 0);
    if (isNaN(additionalDiscount) || additionalDiscount < 0) {
      return res.status(400).json({ 
        error: 'Additional discount cannot be negative' 
      });
    }

    console.log('📝 Creating CustomerBill document...');

    // Create customer bill with all required data
    const customerBillData = {
      affiliateId: req.user.userId,
      customerPhoneNumber: customerPhoneNumber.trim(),
      customerName: customerName?.trim() || '',
      items: processedItems,
      discountAmount: additionalDiscount,
      remarks: remarks?.trim() || '',
      paymentMethod: paymentMethod || 'pending',
      status: 'sent'
    };

    console.log('💾 CustomerBill data prepared:', {
      affiliateId: customerBillData.affiliateId,
      customerPhoneNumber: customerBillData.customerPhoneNumber,
      itemsCount: customerBillData.items.length,
      discountAmount: customerBillData.discountAmount
    });

    const customerBill = new CustomerBill(customerBillData);

    console.log('💾 Attempting to save CustomerBill...');
    const savedBill = await customerBill.save();

    console.log('✅ Bill created successfully:', {
      billId: savedBill._id,
      billNumber: savedBill.billNumber,
      subtotal: savedBill.subtotal,
      totalItemDiscounts: savedBill.totalItemDiscounts,
      additionalDiscount: savedBill.discountAmount,
      finalTotal: savedBill.totalAmount
    });

    // Update inventory if needed
    if (req.affiliate.affiliateDetails?.requiresInventoryManagement) {
      console.log('📦 Updating inventory...');
      
      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        
        if (item.inventoryItemId) {
          try {
            const inventoryItem = await Inventory.findById(item.inventoryItemId);
            if (inventoryItem) {
              await inventoryItem.updateStock(item.quantity);
              console.log(`📦 Updated inventory for ${inventoryItem.itemName}: ${inventoryItem.availableQuantity} remaining`);
            }
          } catch (invUpdateError) {
            console.error('❌ Failed to update inventory for item:', item.itemName, invUpdateError);
            // Don't fail the bill creation, just log the error
          }
        }
      }
    }

    // Generate PDF (placeholder for now)
    try {
      await savedBill.generatePDF();
    } catch (pdfError) {
      console.error('⚠️ PDF generation failed:', pdfError);
      // Don't fail the bill creation
    }

    // Send WhatsApp (placeholder for now)
    try {
      await savedBill.sendWhatsApp();
    } catch (whatsappError) {
      console.error('⚠️ WhatsApp sending failed:', whatsappError);
      // Don't fail the bill creation
    }

    // Return bill with breakdown
    const billBreakdown = savedBill.getBillBreakdown();

    console.log('🎉 Bill creation completed successfully');

    res.status(201).json({
      message: 'Customer bill created successfully',
      bill: {
        _id: savedBill._id,
        billNumber: savedBill.billNumber,
        customerPhoneNumber: savedBill.customerPhoneNumber,
        customerName: savedBill.customerName,
        items: savedBill.items,
        subtotal: savedBill.subtotal,
        discountAmount: savedBill.discountAmount,
        totalItemDiscounts: savedBill.totalItemDiscounts,
        totalAmount: savedBill.totalAmount,
        status: savedBill.status,
        billDate: savedBill.billDate,
        breakdown: billBreakdown
      }
    });

  } catch (error) {
    console.error('❌ Create customer bill error:', error);
    
    // Enhanced error response
    let errorMessage = 'Failed to create customer bill';
    let statusCode = 500;
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      const errorMessages = Object.values(error.errors).map(err => err.message);
      errorMessage = `Validation failed: ${errorMessages.join(', ')}`;
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      statusCode = 400;
      errorMessage = 'Duplicate bill number. Please try again.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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