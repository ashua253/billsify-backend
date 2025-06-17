// models/CustomerBill.js - FIXED: Synchronous pre-save middleware to avoid async issues
const mongoose = require('mongoose');

const customerBillSchema = new mongoose.Schema({
  // Bill identification
  billNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Affiliate who generated the bill
  affiliateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Customer details
  customerPhoneNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  customerName: {
    type: String,
    trim: true,
    default: ''
  },
  
  // UPDATED: Bill items with individual discounts
  items: [{
    itemName: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    // NEW: Item-level discount
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    // Reference to inventory item (if inventory managed)
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory'
    }
  }],
  
  // Bill totals
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  // UPDATED: Additional discount (separate from item discounts)
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // NEW: Total item discounts (sum of all item-level discounts)
  totalItemDiscounts: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Additional details
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Bill status
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'cancelled'],
    default: 'draft'
  },
  
  // WhatsApp sending status
  whatsappSent: {
    type: Boolean,
    default: false
  },
  
  whatsappSentAt: Date,
  
  // PDF details
  pdfPath: {
    type: String,
    default: ''
  },
  
  // Payment details
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'pending'],
    default: 'pending'
  },
  
  paidAt: Date,
  
  billDate: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
customerBillSchema.index({ affiliateId: 1, billDate: -1 });
customerBillSchema.index({ customerPhoneNumber: 1, billDate: -1 });
customerBillSchema.index({ affiliateId: 1, status: 1 });

// FIXED: Split pre-save into separate functions for better reliability
customerBillSchema.pre('save', function(next) {
  console.log('🔄 Pre-save middleware executing...');
  
  try {
    // Step 1: Generate bill number (synchronously)
    if (this.isNew && !this.billNumber) {
      this.generateBillNumber();
    }
    
    // Step 2: Calculate totals (synchronously)
    this.calculateTotals();
    
    // Step 3: Validate required fields
    this.validateRequiredFields();
    
    console.log('✅ Pre-save completed successfully:', {
      billNumber: this.billNumber,
      subtotal: this.subtotal,
      totalAmount: this.totalAmount
    });
    
    next();
  } catch (error) {
    console.error('❌ Pre-save error:', error);
    next(error);
  }
});

// FIXED: Synchronous bill number generation method
customerBillSchema.methods.generateBillNumber = function() {
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
                 (date.getMonth() + 1).toString().padStart(2, '0') +
                 date.getDate().toString().padStart(2, '0');
  
  // Generate a random sequence for now (can be improved with counter)
  const sequence = Math.floor(Math.random() * 9999) + 1;
  this.billNumber = `BILL${dateStr}${sequence.toString().padStart(4, '0')}`;
  
  console.log('📝 Generated bill number:', this.billNumber);
};

// FIXED: Synchronous calculation method
customerBillSchema.methods.calculateTotals = function() {
  console.log('💰 Calculating totals...');
  
  if (!this.items || !Array.isArray(this.items) || this.items.length === 0) {
    throw new Error('At least one item is required');
  }
  
  let itemSubtotal = 0;
  let totalItemDiscounts = 0;
  
  this.items.forEach((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const itemDiscount = Number(item.discount) || 0;
    
    if (quantity <= 0 || unitPrice < 0) {
      throw new Error(`Invalid item data at index ${index}`);
    }
    
    const itemGross = quantity * unitPrice;
    const netAmount = Math.max(0, itemGross - itemDiscount);
    
    // Update item totalPrice
    item.totalPrice = netAmount;
    
    itemSubtotal += itemGross;
    totalItemDiscounts += itemDiscount;
    
    console.log(`📊 Item ${index + 1}:`, {
      gross: itemGross,
      discount: itemDiscount,
      net: netAmount
    });
  });
  
  this.subtotal = itemSubtotal;
  this.totalItemDiscounts = totalItemDiscounts;
  
  const additionalDiscount = Number(this.discountAmount) || 0;
  this.discountAmount = additionalDiscount;
  
  this.totalAmount = Math.max(0, this.subtotal - this.totalItemDiscounts - additionalDiscount);
  
  console.log('💰 Final calculations:', {
    subtotal: this.subtotal,
    totalItemDiscounts: this.totalItemDiscounts,
    additionalDiscount: this.discountAmount,
    totalAmount: this.totalAmount
  });
};

// FIXED: Validation method
customerBillSchema.methods.validateRequiredFields = function() {
  if (!this.billNumber) {
    throw new Error('Bill number is required');
  }
  if (this.subtotal === undefined || this.subtotal < 0) {
    throw new Error('Valid subtotal is required');
  }
  if (this.totalAmount === undefined || this.totalAmount < 0) {
    throw new Error('Valid total amount is required');
  }
};

// Instance methods
customerBillSchema.methods.generatePDF = async function() {
  const pdfFileName = `${this.billNumber}.pdf`;
  this.pdfPath = `/bills/pdfs/${pdfFileName}`;
  return this.pdfPath;
};

customerBillSchema.methods.sendWhatsApp = async function() {
  this.whatsappSent = true;
  this.whatsappSentAt = new Date();
  return this.save();
};

customerBillSchema.methods.getBillBreakdown = function() {
  const breakdown = {
    items: this.items.map(item => ({
      name: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      grossAmount: item.quantity * item.unitPrice,
      itemDiscount: item.discount || 0,
      netAmount: item.totalPrice
    })),
    subtotal: this.subtotal,
    totalItemDiscounts: this.totalItemDiscounts,
    additionalDiscount: this.discountAmount || 0,
    totalDiscounts: this.totalItemDiscounts + (this.discountAmount || 0),
    finalTotal: this.totalAmount
  };
  
  return breakdown;
};

// Static methods
customerBillSchema.statics.getAffiliateSales = function(affiliateId, startDate, endDate) {
  const matchQuery = { 
    affiliateId: affiliateId,
    status: { $ne: 'cancelled' }
  };
  
  if (startDate && endDate) {
    matchQuery.billDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        totalItemDiscounts: { $sum: '$totalItemDiscounts' },
        totalAdditionalDiscounts: { $sum: '$discountAmount' },
        totalDiscounts: { $sum: { $add: ['$totalItemDiscounts', '$discountAmount'] } }
      }
    }
  ]);
};

customerBillSchema.statics.getCustomerBills = function(phoneNumber) {
  return this.find({
    customerPhoneNumber: phoneNumber,
    status: { $ne: 'cancelled' }
  })
  .populate('affiliateId', 'name affiliateDetails.organizationName')
  .sort({ billDate: -1 });
};

customerBillSchema.statics.getDiscountAnalysis = function(affiliateId, startDate, endDate) {
  const matchQuery = { 
    affiliateId: affiliateId,
    status: { $ne: 'cancelled' }
  };
  
  if (startDate && endDate) {
    matchQuery.billDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.aggregate([
    { $match: matchQuery },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.itemName',
        totalQuantitySold: { $sum: '$items.quantity' },
        totalGrossRevenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
        totalItemDiscounts: { $sum: '$items.discount' },
        averageDiscount: { $avg: '$items.discount' },
        billCount: { $sum: 1 }
      }
    },
    { $sort: { totalGrossRevenue: -1 } }
  ]);
};

const CustomerBill = mongoose.model('CustomerBill', customerBillSchema);

module.exports = CustomerBill;