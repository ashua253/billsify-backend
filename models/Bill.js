// models/Bill.js - Enhanced with OCR extracted data support
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Original manual entry fields (for backward compatibility)
  deviceName: {
    type: String,
    trim: true,
    maxlength: 200
  },
  deviceNumber: {
    type: String,
    trim: true,
    maxlength: 100
  },
  deviceCost: {
    type: Number,
    min: 0
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  imageUri: {
    type: String,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  // OCR Processing fields
  ocrProcessed: {
    type: Boolean,
    default: false
  },
  ocrConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  
  // Extracted data from OCR in structured JSON format
  extractedData: {
    // Bill identification
    billType: {
      type: String,
      enum: ['electricity', 'water', 'gas', 'internet', 'mobile', 'credit_card', 'shopping', 'restaurant', 'medical', 'insurance', 'other'],
      default: 'other'
    },
    
    // Vendor/Company information
    vendor: {
      name: String,
      address: String,
      phone: String,
      email: String
    },
    
    // Bill details
    billNumber: String,
    billDate: Date,
    dueDate: Date,
    
    // Financial information
    totalAmount: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    
    // Line items (for detailed bills)
    items: [{
      description: String,
      quantity: Number,
      unitPrice: Number,
      totalPrice: Number,
      category: String
    }],
    
    // Payment information
    paymentDetails: {
      previousBalance: Number,
      currentCharges: Number,
      totalDue: Number,
      minimumDue: Number,
      paymentDueDate: Date
    },
    
    // Utility-specific data
    utilityData: {
      accountNumber: String,
      meterNumber: String,
      serviceAddress: String,
      billingPeriod: {
        from: Date,
        to: Date
      },
      consumption: {
        current: Number,
        previous: Number,
        units: String
      }
    },
    
    // Additional extracted text and metadata
    rawText: String,
    confidence: Number,
    processingDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Backend compatibility fields
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  vendor: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  
  category: {
    type: String,
    default: 'Other',
    enum: [
      'General', 
      'Electronics', 
      'Utilities', 
      'Food', 
      'Transportation', 
      'Healthcare', 
      'Entertainment', 
      'Shopping', 
      'Services',
      'Other'
    ]
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Store original frontend data for compatibility
  frontendData: {
    deviceName: String,
    deviceNumber: String,
    deviceCost: String,
    remarks: String,
    imageUri: String,
    submittedAt: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
billSchema.index({ userId: 1, createdAt: -1 });
billSchema.index({ userId: 1, category: 1 });
billSchema.index({ userId: 1, date: -1 });
billSchema.index({ userId: 1, 'extractedData.billType': 1 });
billSchema.index({ userId: 1, 'extractedData.dueDate': 1 });

// Text index for search functionality (enhanced with OCR data)
billSchema.index({
  deviceName: 'text',
  deviceNumber: 'text',
  remarks: 'text',
  description: 'text',
  vendor: 'text',
  notes: 'text',
  'extractedData.vendor.name': 'text',
  'extractedData.billNumber': 'text',
  'extractedData.rawText': 'text'
});

// Pre-save middleware to ensure field consistency
billSchema.pre('save', function(next) {
  // If OCR processed, use extracted data for main fields
  if (this.ocrProcessed && this.extractedData) {
    // Set amount from extracted data if available
    if (this.extractedData.totalAmount && !this.amount) {
      this.amount = this.extractedData.totalAmount;
    }
    
    // Set description from vendor name if available
    if (this.extractedData.vendor?.name && !this.description) {
      this.description = this.extractedData.vendor.name;
    }
    
    // Set category based on bill type
    if (this.extractedData.billType && this.category === 'Other') {
      const categoryMap = {
        'electricity': 'Utilities',
        'water': 'Utilities',
        'gas': 'Utilities',
        'internet': 'Services',
        'mobile': 'Services',
        'shopping': 'Shopping',
        'restaurant': 'Food',
        'medical': 'Healthcare'
      };
      this.category = categoryMap[this.extractedData.billType] || 'Other';
    }
    
    // Set date from bill date if available
    if (this.extractedData.billDate && !this.date) {
      this.date = this.extractedData.billDate;
    }
  }
  
  // Original compatibility logic
  if (!this.amount && this.deviceCost) {
    this.amount = this.deviceCost;
  }
  if (!this.deviceCost && this.amount) {
    this.deviceCost = this.amount;
  }
  
  if (!this.description && this.deviceName) {
    this.description = this.deviceName;
  }
  if (!this.deviceName && this.description) {
    this.deviceName = this.description;
  }
  
  next();
});

// Instance method to get formatted amount
billSchema.methods.getFormattedAmount = function() {
  const amount = this.extractedData?.totalAmount || this.amount || 0;
  const currency = this.extractedData?.currency || 'INR';
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
};

// Instance method to get bill summary for display
billSchema.methods.getBillSummary = function() {
  if (this.ocrProcessed && this.extractedData) {
    return {
      title: this.extractedData.vendor?.name || this.description,
      type: this.extractedData.billType,
      amount: this.extractedData.totalAmount || this.amount,
      billNumber: this.extractedData.billNumber,
      billDate: this.extractedData.billDate || this.date,
      dueDate: this.extractedData.dueDate,
      vendor: this.extractedData.vendor,
      isOCRProcessed: true
    };
  } else {
    return {
      title: this.deviceName || this.description,
      type: 'manual',
      amount: this.deviceCost || this.amount,
      billNumber: this.deviceNumber,
      billDate: this.submittedAt || this.date,
      vendor: { name: this.vendor },
      isOCRProcessed: false
    };
  }
};

// Static method to search bills with OCR data
billSchema.statics.searchBillsWithOCR = async function(userId, searchParams) {
  const matchCriteria = { userId: new mongoose.Types.ObjectId(userId) };
  
  // Build search criteria
  if (searchParams.query) {
    matchCriteria.$or = [
      { deviceName: { $regex: searchParams.query, $options: 'i' } },
      { description: { $regex: searchParams.query, $options: 'i' } },
      { 'extractedData.vendor.name': { $regex: searchParams.query, $options: 'i' } },
      { 'extractedData.billNumber': { $regex: searchParams.query, $options: 'i' } },
      { 'extractedData.rawText': { $regex: searchParams.query, $options: 'i' } }
    ];
  }
  
  if (searchParams.billType) {
    matchCriteria['extractedData.billType'] = searchParams.billType;
  }
  
  if (searchParams.startDate || searchParams.endDate) {
    const dateField = 'extractedData.billDate';
    matchCriteria[dateField] = {};
    if (searchParams.startDate) matchCriteria[dateField].$gte = new Date(searchParams.startDate);
    if (searchParams.endDate) matchCriteria[dateField].$lte = new Date(searchParams.endDate);
  }
  
  return await this.find(matchCriteria).sort({ createdAt: -1 });
};

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;