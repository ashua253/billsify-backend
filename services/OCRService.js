// services/OCRService.js - Updated for Render deployment compatibility
const vision = require('@google-cloud/vision');

class OCRService {
  constructor() {
    // Initialize Google Cloud Vision client with flexible credential handling
    this.client = this.initializeVisionClient();
  }

  initializeVisionClient() {
    try {
      let clientConfig = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      };

      // Method 1: For Render/Production - Use JSON from environment variable
      if (process.env.GOOGLE_CLOUD_CREDENTIALS_JSON) {
        console.log('🔑 Using Google Cloud credentials from environment variable');
        
        try {
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON);
          clientConfig.credentials = credentials;
        } catch (parseError) {
          throw new Error(`Failed to parse Google Cloud credentials JSON: ${parseError.message}`);
        }
        
      } 
      // Method 2: For Local Development - Use file path
      else if (process.env.GOOGLE_CLOUD_KEY_FILE) {
        console.log('🔑 Using Google Cloud credentials from file:', process.env.GOOGLE_CLOUD_KEY_FILE);
        clientConfig.keyFilename = process.env.GOOGLE_CLOUD_KEY_FILE;
        
      } 
      // Method 3: No credentials found
      else {
        throw new Error('No Google Cloud credentials found. Set either GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_CLOUD_KEY_FILE environment variable');
      }

      return new vision.ImageAnnotatorClient(clientConfig);
      
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision client:', error.message);
      throw error;
    }
  }

  // Main method to process bill image and extract structured data
  async processBillImage(imageBuffer, mimeType = 'image/jpeg') {
    try {
      console.log('🔍 Starting OCR processing for bill image...');
      
      // Step 1: Extract text from image
      const extractedText = await this.extractTextFromImage(imageBuffer, mimeType);
      
      // Step 2: Parse text to identify bill structure
      const structuredData = await this.parseExtractedText(extractedText);
      
      console.log('✅ OCR processing completed successfully');
      return {
        success: true,
        extractedData: structuredData,
        rawText: extractedText.fullText,
        confidence: extractedText.confidence
      };
      
    } catch (error) {
      console.error('❌ OCR processing failed:', error);
      return {
        success: false,
        error: error.message,
        extractedData: null
      };
    }
  }

  // Extract text using Google Cloud Vision API
  async extractTextFromImage(imageBuffer, mimeType) {
    try {
      const request = {
        image: {
          content: imageBuffer.toString('base64'),
        },
        features: [
          { type: 'TEXT_DETECTION' },
          { type: 'DOCUMENT_TEXT_DETECTION' }
        ],
      };

      const [result] = await this.client.annotateImage(request);
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        throw new Error('No text detected in the image');
      }

      // Get full text and individual words with positions
      const fullText = detections[0].description;
      const words = detections.slice(1).map(detection => ({
        text: detection.description,
        confidence: detection.confidence || 0.8,
        bounds: detection.boundingPoly
      }));

      return {
        fullText,
        words,
        confidence: this.calculateOverallConfidence(words)
      };
      
    } catch (error) {
      console.error('Google Vision API error:', error);
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  // Parse extracted text to identify bill components
  async parseExtractedText(extractedText) {
    const text = extractedText.fullText.toLowerCase();
    const lines = extractedText.fullText.split('\n').map(line => line.trim()).filter(line => line);
    
    const structuredData = {
      billType: this.identifyBillType(text),
      vendor: this.extractVendorInfo(lines),
      billNumber: this.extractBillNumber(lines),
      billDate: this.extractBillDate(lines),
      dueDate: this.extractDueDate(lines),
      totalAmount: this.extractTotalAmount(lines),
      currency: this.extractCurrency(text),
      items: this.extractLineItems(lines),
      paymentDetails: this.extractPaymentDetails(lines),
      utilityData: this.extractUtilityData(lines, text),
      rawText: extractedText.fullText,
      confidence: extractedText.confidence,
      processingDate: new Date()
    };

    return structuredData;
  }

  // Helper methods for text parsing
  identifyBillType(text) {
    const billTypePatterns = {
      'electricity': ['electricity', 'power', 'electric', 'kwh', 'units consumed', 'meter reading'],
      'water': ['water', 'municipal', 'water board', 'water supply'],
      'gas': ['gas', 'lpg', 'petroleum', 'cylinder'],
      'internet': ['internet', 'broadband', 'wifi', 'data', 'mbps'],
      'mobile': ['mobile', 'phone', 'cellular', 'telecom', 'airtime'],
      'credit_card': ['credit card', 'statement', 'minimum due', 'credit limit'],
      'shopping': ['invoice', 'receipt', 'purchase', 'retail', 'store'],
      'restaurant': ['restaurant', 'cafe', 'food', 'dining', 'menu'],
      'medical': ['medical', 'hospital', 'clinic', 'pharmacy', 'prescription'],
      'insurance': ['insurance', 'policy', 'premium', 'coverage']
    };

    for (const [type, keywords] of Object.entries(billTypePatterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type;
      }
    }
    
    return 'other';
  }

  extractVendorInfo(lines) {
    const vendor = { name: '', address: '', phone: '', email: '' };
    
    // Look for company name (usually first non-empty line)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line && !this.isDateOrNumber(line) && line.length > 3) {
        vendor.name = line;
        break;
      }
    }
    
    return vendor;
  }

  extractTotalAmount(lines) {
    const amountPatterns = [
      /total.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i,
      /amount.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i,
      /(?:rs\.?|₹)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs\.?|₹)/i
    ];
    
    const fullText = lines.join(' ');
    
    for (const pattern of amountPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0) {
          return amount;
        }
      }
    }
    
    return null;
  }

  extractBillNumber(lines) {
    const patterns = [
      /bill\s*(?:no|number|#):?\s*([a-z0-9]+)/i,
      /invoice\s*(?:no|number|#):?\s*([a-z0-9]+)/i,
      /receipt\s*(?:no|number|#):?\s*([a-z0-9]+)/i,
      /ref\s*(?:no|number)?:?\s*([a-z0-9]+)/i
    ];
    
    const fullText = lines.join(' ');
    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  // Additional helper methods
  extractBillDate(lines) { return null; }
  extractDueDate(lines) { return null; }
  extractCurrency(text) { return 'INR'; }
  extractLineItems(lines) { return []; }
  extractPaymentDetails(lines) { return {}; }
  extractUtilityData(lines, text) { return {}; }
  
  calculateOverallConfidence(words) {
    if (!words || words.length === 0) return 0;
    const totalConfidence = words.reduce((sum, word) => sum + (word.confidence || 0.8), 0);
    return totalConfidence / words.length;
  }
  
  isDateOrNumber(text) {
    return /^\d+([\/\-\.]\d+)*$/.test(text) || /^\d+$/.test(text);
  }
}

module.exports = new OCRService();