// models/CustomerBill.js - FIXED: Proper pre-save middleware with error handling
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

// FIXED: Enhanced pre-save middleware with proper error handling and logging
customerBillSchema.pre('save', async function(next) {
  try {
    console.log('🔄 Pre-save middleware executing for CustomerBill...');
    
    // Generate bill number if new document
    if (this.isNew && !this.billNumber) {
      console.log('📝 Generating bill number...');
      
      const date = new Date();
      const dateStr = date.getFullYear().toString() +
                     (date.getMonth() + 1).toString().padStart(2, '0') +
                     date.getDate().toString().padStart(2, '0');
      
      try {
        // Find the last bill number for today
        const lastBill = await this.constructor.findOne({
          billNumber: new RegExp(`^BILL${dateStr}`)
        }).sort({ billNumber: -1 });
        
        let sequence = 1;
        if (lastBill && lastBill.billNumber) {
          const lastSequence = parseInt(lastBill.billNumber.slice(-4));
          if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
          }
        }
        
        this.billNumber = `BILL${dateStr}${sequence.toString().padStart(4, '0')}`;
        console.log('✅ Generated bill number:', this.billNumber);
        
      } catch (billNumberError) {
        console.error('❌ Error generating bill number:', billNumberError);
        // Fallback bill number
        this.billNumber = `BILL${dateStr}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        console.log('⚠️ Using fallback bill number:', this.billNumber);
      }
    }
    
    // FIXED: Calculate totals with enhanced error handling
    console.log('💰 Calculating bill totals...');
    console.log('📦 Items to process:', this.items.length);
    
    let itemSubtotal = 0;
    let totalItemDiscounts = 0;
    
    // Ensure items array exists and has valid data
    if (!this.items || !Array.isArray(this.items) || this.items.length === 0) {
      console.error('❌ No valid items found for bill calculation');
      return next(new Error('At least one item is required for bill creation'));
    }
    
    // Process each item
    this.items.forEach((item, index) => {
      console.log(`📊 Processing item ${index + 1}:`, {
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0
      });
      
      // Validate item data
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const itemDiscount = parseFloat(item.discount) || 0;
      
      if (quantity <= 0 || unitPrice < 0) {
        console.error(`❌ Invalid item data at index ${index}:`, { quantity, unitPrice });
        return next(new Error(`Invalid item data: quantity must be > 0 and unitPrice must be >= 0`));
      }
      
      const itemGross = quantity * unitPrice;
      const netAmount = Math.max(0, itemGross - itemDiscount);
      
      // Update item totalPrice
      item.totalPrice = netAmount;
      
      // Add to totals
      itemSubtotal += itemGross;
      totalItemDiscounts += itemDiscount;
      
      console.log(`✅ Item ${index + 1} processed:`, {
        gross: itemGross,
        discount: itemDiscount,
        net: netAmount
      });
    });
    
    // Set calculated values
    this.subtotal = itemSubtotal;
    this.totalItemDiscounts = totalItemDiscounts;
    
    // Ensure discountAmount is a valid number
    const additionalDiscount = parseFloat(this.discountAmount) || 0;
    this.discountAmount = additionalDiscount;
    
    // Calculate final total
    this.totalAmount = Math.max(0, this.subtotal - this.totalItemDiscounts - additionalDiscount);
    
    console.log('💰 Final bill calculations:', {
      subtotal: this.subtotal,
      totalItemDiscounts: this.totalItemDiscounts,
      additionalDiscount: this.discountAmount,
      finalTotal: this.totalAmount
    });
    
    // Validate that required fields are set
    if (!this.billNumber) {
      return next(new Error('Bill number generation failed'));
    }
    if (this.subtotal === undefined || this.subtotal < 0) {
      return next(new Error('Invalid subtotal calculated'));
    }
    if (this.totalAmount === undefined || this.totalAmount < 0) {
      return next(new Error('Invalid total amount calculated'));
    }
    
    console.log('✅ Pre-save middleware completed successfully');
    next();
    
  } catch (error) {
    console.error('❌ Pre-save middleware error:', error);
    next(error);
  }
});

// Instance methods
customerBillSchema.methods.generatePDF = async function() {
  // This would integrate with a PDF generation service
  // For now, return a placeholder path
  const pdfFileName = `${this.billNumber}.pdf`;
  this.pdfPath = `/bills/pdfs/${pdfFileName}`;
  return this.pdfPath;
};

customerBillSchema.methods.sendWhatsApp = async function() {
  // This would integrate with WhatsApp Business API
  // For now, mark as sent
  this.whatsappSent = true;
  this.whatsappSentAt = new Date();
  return this.save();
};

// UPDATED: Get detailed bill breakdown
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

// NEW: Get discount analysis for affiliate
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