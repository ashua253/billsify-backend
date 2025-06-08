// routes/ocr.js - Complete OCR processing endpoints with mongoose import fix
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose'); // ← CRITICAL FIX: Added missing mongoose import
const router = express.Router();
const Bill = require('../models/Bill');
const OCRService = require('../services/OCRService');
const authenticateToken = require('../middleware/auth');

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// POST /api/ocr/process-image - Process image and extract bill data
router.post('/process-image', authenticateToken, upload.single('billImage'), async (req, res) => {
  try {
    console.log('📥 OCR processing request received');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('📷 Image details:', {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    // Process image with OCR
    console.log('🔍 Starting OCR processing...');
    const ocrResult = await OCRService.processBillImage(req.file.buffer, req.file.mimetype);
    
    if (!ocrResult.success) {
      console.error('❌ OCR processing failed:', ocrResult.error);
      return res.status(500).json({ 
        error: 'OCR processing failed',
        details: ocrResult.error 
      });
    }

    console.log('✅ OCR processing completed successfully');
    console.log('📊 Extracted data summary:', {
      billType: ocrResult.extractedData.billType,
      vendor: ocrResult.extractedData.vendor?.name,
      amount: ocrResult.extractedData.totalAmount,
      confidence: ocrResult.confidence
    });

    // Return extracted data for review
    res.json({
      success: true,
      message: 'OCR processing completed',
      extractedData: ocrResult.extractedData,
      confidence: ocrResult.confidence,
      suggestions: {
        needsReview: ocrResult.confidence < 0.7,
        reviewFields: ocrResult.confidence < 0.7 ? ['totalAmount', 'billDate', 'vendor'] : []
      }
    });

  } catch (error) {
    console.error('❌ OCR endpoint error:', error);
    
    // Handle specific errors
    if (error.message.includes('Only image files')) {
      return res.status(400).json({ error: 'Please upload a valid image file' });
    }
    
    if (error.message.includes('File too large')) {
      return res.status(400).json({ error: 'Image file is too large. Please upload an image smaller than 10MB' });
    }
    
    res.status(500).json({ 
      error: 'OCR processing failed',
      details: error.message 
    });
  }
});

// POST /api/ocr/create-bill - Create bill with OCR extracted data
router.post('/create-bill', authenticateToken, async (req, res) => {
  try {
    console.log('📥 Creating bill with OCR data...');
    
    const { extractedData, userConfirmedData, imageUri } = req.body;
    
    if (!extractedData) {
      return res.status(400).json({ error: 'Extracted data is required' });
    }

    // Merge extracted data with user confirmed data
    const finalData = {
      ...extractedData,
      ...userConfirmedData // User can override any extracted data
    };

    console.log('🔍 Final bill data:', {
      billType: finalData.billType,
      vendor: finalData.vendor?.name,
      amount: finalData.totalAmount
    });

    // Create bill with OCR data
    const bill = new Bill({
      userId: req.user.userId,
      
      // Mark as OCR processed
      ocrProcessed: true,
      ocrConfidence: finalData.confidence || 0,
      
      // Store structured extracted data
      extractedData: finalData,
      
      // Set main fields from extracted data
      amount: finalData.totalAmount || 0,
      description: finalData.vendor?.name || 'Unknown Vendor',
      vendor: finalData.vendor?.name || '',
      notes: finalData.rawText ? finalData.rawText.substring(0, 500) : '',
      category: finalData.billType === 'electricity' ? 'Utilities' : 
                finalData.billType === 'shopping' ? 'Shopping' : 
                finalData.billType === 'restaurant' ? 'Food' : 
                finalData.billType === 'mobile' ? 'Services' :
                finalData.billType === 'internet' ? 'Services' : 'Other',
      date: finalData.billDate || new Date(),
      
      // Store image URI
      imageUri: imageUri,
      
      // Backward compatibility fields
      deviceName: finalData.vendor?.name || 'OCR Processed Bill',
      deviceNumber: finalData.billNumber || '',
      deviceCost: finalData.totalAmount || 0,
      remarks: `OCR processed - ${finalData.billType} bill`,
      submittedAt: new Date(),
      
      // Store frontend data for compatibility
      frontendData: {
        deviceName: finalData.vendor?.name || 'OCR Processed Bill',
        deviceNumber: finalData.billNumber || '',
        deviceCost: (finalData.totalAmount || 0).toString(),
        remarks: `OCR processed - ${finalData.billType} bill`,
        imageUri: imageUri,
        submittedAt: new Date().toISOString()
      }
    });

    const savedBill = await bill.save();
    console.log('✅ OCR bill saved successfully with ID:', savedBill._id);

    // Return bill summary for frontend
    const billSummary = savedBill.getBillSummary();
    
    res.status(201).json({
      success: true,
      message: 'Bill created successfully with OCR data',
      bill: {
        _id: savedBill._id,
        ...billSummary,
        createdAt: savedBill.createdAt,
        extractedData: savedBill.extractedData
      }
    });

  } catch (error) {
    console.error('❌ Create OCR bill error:', error);
    
    if (error.name === 'ValidationError') {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errorMessages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create bill',
      details: error.message 
    });
  }
});

// GET /api/ocr/bill/:id - Get OCR processed bill details
router.get('/bill/:id', authenticateToken, async (req, res) => {
  try {
    const bill = await Bill.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Return detailed bill information
    const response = {
      ...bill.toObject(),
      summary: bill.getBillSummary(),
      formattedAmount: bill.getFormattedAmount()
    };

    res.json(response);

  } catch (error) {
    console.error('Get OCR bill error:', error);
    res.status(500).json({ error: 'Failed to retrieve bill' });
  }
});

// GET /api/ocr/search - Enhanced search with OCR data
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, billType, startDate, endDate, minAmount, maxAmount } = req.query;
    
    const searchParams = {
      query,
      billType,
      startDate,
      endDate,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined
    };

    console.log('🔍 OCR enhanced search with params:', searchParams);
    
    const bills = await Bill.searchBillsWithOCR(req.user.userId, searchParams);
    
    // Transform bills for frontend with OCR awareness
    const transformedBills = bills.map(bill => {
      const summary = bill.getBillSummary();
      return {
        _id: bill._id,
        ...summary,
        createdAt: bill.createdAt,
        imageUri: bill.imageUri,
        confidence: bill.ocrConfidence,
        // Include both OCR and manual entry data for compatibility
        deviceName: summary.title,
        deviceNumber: summary.billNumber || bill.deviceNumber,
        deviceCost: summary.amount?.toString() || '0',
        remarks: bill.remarks || '',
        submittedAt: summary.billDate || bill.submittedAt
      };
    });
    
    res.json({
      success: true,
      bills: transformedBills,
      total: transformedBills.length
    });

  } catch (error) {
    console.error('OCR search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/ocr/stats - Get OCR processing statistics (FIXED WITH MONGOOSE IMPORT)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // FIXED: Now using imported mongoose
    const stats = await Bill.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          ocrProcessedBills: {
            $sum: { $cond: ['$ocrProcessed', 1, 0] }
          },
          manualBills: {
            $sum: { $cond: ['$ocrProcessed', 0, 1] }
          },
          totalAmount: { $sum: '$amount' },
          avgConfidence: {
            $avg: { $cond: ['$ocrProcessed', '$ocrConfidence', null] }
          }
        }
      }
    ]);

    const billTypeStats = await Bill.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          ocrProcessed: true 
        } 
      },
      {
        $group: {
          _id: '$extractedData.billType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$extractedData.totalAmount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = stats.length > 0 ? stats[0] : {
      totalBills: 0,
      ocrProcessedBills: 0,
      manualBills: 0,
      totalAmount: 0,
      avgConfidence: 0
    };

    res.json({
      success: true,
      stats: {
        ...result,
        ocrProcessingRate: result.totalBills > 0 ? 
          (result.ocrProcessedBills / result.totalBills * 100).toFixed(1) : 0,
        billTypeBreakdown: billTypeStats
      }
    });

  } catch (error) {
    console.error('OCR stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// GET /api/ocr/health - OCR service health check
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const healthCheck = await OCRService.healthCheck();
    
    res.json({
      success: true,
      ocr: healthCheck,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OCR health check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'OCR health check failed',
      details: error.message 
    });
  }
});

module.exports = router;