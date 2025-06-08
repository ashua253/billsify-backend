// services/OCRService.js - Complete Enhanced OCR service with Google Cloud Vision API
const vision = require('@google-cloud/vision');

class OCRService {
  constructor() {
    try {
      this.client = this.initializeVisionClient();
    } catch (error) {
      console.error('❌ OCR Service initialization failed:', error.message);
      this.client = null;
    }
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
        console.log('⚠️ No Google Cloud credentials found. OCR will be disabled.');
        throw new Error('No Google Cloud credentials found. Set either GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_CLOUD_KEY_FILE environment variable');
      }

      const client = new vision.ImageAnnotatorClient(clientConfig);
      console.log('✅ Google Cloud Vision client initialized successfully');
      return client;
      
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision client:', error.message);
      throw error;
    }
  }

  // Main method to process bill image and extract structured data
  async processBillImage(imageBuffer, mimeType = 'image/jpeg') {
    try {
      console.log('🔍 Starting OCR processing for bill image...');
      
      if (!this.client) {
        throw new Error('Google Cloud Vision client not initialized. Check your credentials.');
      }
      
      // Step 1: Extract text from image
      const extractedText = await this.extractTextFromImage(imageBuffer, mimeType);
      
      // Step 2: Parse text to identify bill structure
      const structuredData = await this.parseExtractedText(extractedText);
      
      console.log('✅ OCR processing completed successfully');
      console.log('📊 Extracted data summary:', {
        billType: structuredData.billType,
        vendor: structuredData.vendor?.name,
        amount: structuredData.totalAmount,
        confidence: structuredData.confidence
      });
      
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

      console.log('📤 Sending image to Google Cloud Vision API...');
      const [result] = await this.client.annotateImage(request);
      
      if (result.error) {
        throw new Error(`Google Vision API error: ${result.error.message}`);
      }
      
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

      console.log('📝 Extracted text length:', fullText.length);
      console.log('🔤 Total words detected:', words.length);
      console.log('📄 Full extracted text:', fullText);

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
    
    console.log('🔍 Parsing extracted text into structured data...');
    console.log('📄 Text lines:', lines.slice(0, 10)); // Log first 10 lines for debugging
    
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

    console.log('📋 Parsed structured data:', {
      billType: structuredData.billType,
      vendorName: structuredData.vendor?.name,
      amount: structuredData.totalAmount,
      billNumber: structuredData.billNumber,
      billDate: structuredData.billDate
    });

    return structuredData;
  }

  // Identify bill type based on keywords
  identifyBillType(text) {
    const billTypePatterns = {
      'electricity': ['electricity', 'power', 'electric', 'kwh', 'units consumed', 'meter reading', 'bescom', 'kseb', 'mseb'],
      'water': ['water', 'municipal', 'water board', 'water supply', 'bmwssb', 'bwssb'],
      'gas': ['gas', 'lpg', 'petroleum', 'cylinder', 'bharatgas', 'indane', 'hp gas'],
      'internet': ['internet', 'broadband', 'wifi', 'data', 'mbps', 'fiber', 'jio', 'airtel', 'bsnl'],
      'mobile': ['mobile', 'phone', 'cellular', 'telecom', 'airtime', 'prepaid', 'postpaid'],
      'credit_card': ['credit card', 'statement', 'minimum due', 'credit limit', 'outstanding', 'hdfc', 'icici', 'sbi card'],
      'shopping': ['invoice', 'receipt', 'purchase', 'retail', 'store', 'amazon', 'flipkart', 'mall', 'shopping', 'bill of supply'],
      'restaurant': ['restaurant', 'cafe', 'food', 'dining', 'menu', 'hotel', 'swiggy', 'zomato'],
      'medical': ['medical', 'hospital', 'clinic', 'pharmacy', 'prescription', 'apollo', 'fortis'],
      'insurance': ['insurance', 'policy', 'premium', 'coverage', 'lic', 'bajaj', 'hdfc life']
    };

    for (const [type, keywords] of Object.entries(billTypePatterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type;
      }
    }
    
    return 'other';
  }

  // Enhanced vendor information extraction
  extractVendorInfo(lines) {
    const vendor = { name: '', address: '', phone: '', email: '' };
    
    // Look for company name in first few lines, but be smarter about it
    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip if line contains obvious non-vendor content
      if (this.isDateOrNumber(line) || 
          line.includes('@') ||
          line.toLowerCase().includes('invoice') ||
          line.toLowerCase().includes('receipt') ||
          line.toLowerCase().includes('bill') ||
          line.length < 3 ||
          /^\d+$/.test(line) ||
          line.toLowerCase().includes('address') ||
          line.toLowerCase().includes('gst')) {
        continue;
      }
      
      // Look for company-like names
      if (line.length >= 3 && line.length <= 50) {
        // Check if it looks like a company name
        if (/^[a-zA-Z][a-zA-Z\s&\.,-]*[a-zA-Z]$/.test(line) ||
            /^[a-zA-Z]+$/.test(line)) {
          vendor.name = line;
          break;
        }
      }
    }
    
    // Extract contact info from full text
    const fullText = lines.join(' ');
    
    // Enhanced phone patterns
    const phonePatterns = [
      /(?:tel|phone|mob|mobile|contact).*?(\+?\d{1,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/i,
      /(\+?\d{2,3}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4})/g,
      /(\d{10,12})/g
    ];
    
    for (const pattern of phonePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        vendor.phone = match[1];
        break;
      }
    }
    
    // Email extraction
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatch = fullText.match(emailRegex);
    if (emailMatch && emailMatch.length > 0) {
      vendor.email = emailMatch[0];
    }
    
    return vendor;
  }

  // Enhanced total amount extraction
  extractTotalAmount(lines) {
    const amountPatterns = [
      // Standard total patterns
      /total.*?(?:rs\.?|₹|inr)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /total.*?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs\.?|₹|inr)?/i,
      
      // Invoice amount patterns
      /(?:total\s*)?invoice\s*amount.*?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /amount.*?(?:rs\.?|₹|inr)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /amount.*?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      
      // Generic currency patterns
      /(?:rs\.?|₹|inr)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs\.?|₹|inr)/gi,
      
      // Balance/due patterns
      /(?:grand\s*total|net\s*amount|balance|due).*?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      
      // Tender/payment patterns
      /(?:tender|payment|paid).*?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      
      // Receipt-specific patterns
      /(\d+\.\d{2})\s*(?:\n|$)/g // Decimal amounts at end of lines
    ];
    
    const fullText = lines.join(' ');
    const amounts = [];
    
    console.log('💰 Searching for amounts in text...');
    
    // Try each pattern and collect all potential amounts
    for (const pattern of amountPatterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const amountStr = match[1] || match[0];
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0 && amount < 1000000) { // Reasonable range
          amounts.push(amount);
          console.log('💰 Found potential amount:', amount, 'from pattern:', pattern.source);
        }
      }
    }
    
    if (amounts.length === 0) {
      console.log('❌ No amounts found');
      return null;
    }
    
    // Prefer amounts that appear near "total" or "amount" keywords
    const textLower = fullText.toLowerCase();
    for (const amount of amounts) {
      const amountStr = amount.toString();
      const amountIndex = textLower.indexOf(amountStr);
      if (amountIndex > -1) {
        const contextBefore = textLower.substring(Math.max(0, amountIndex - 50), amountIndex);
        const contextAfter = textLower.substring(amountIndex, amountIndex + 50);
        
        if (contextBefore.includes('total') || contextBefore.includes('amount') || 
            contextAfter.includes('total') || contextAfter.includes('amount') ||
            contextBefore.includes('invoice') || contextBefore.includes('payment')) {
          console.log('✅ Selected contextual amount:', amount);
          return amount;
        }
      }
    }
    
    // Return the largest amount if no contextual match
    const selectedAmount = Math.max(...amounts);
    console.log('✅ Selected largest amount:', selectedAmount);
    return selectedAmount;
  }

  // Enhanced bill number extraction
  extractBillNumber(lines) {
    const patterns = [
      // Standard patterns
      /(?:bill|invoice|receipt)\s*(?:no|number|#):?\s*([a-z0-9]+)/i,
      /(?:ref|reference)\s*(?:no|number)?:?\s*([a-z0-9]+)/i,
      /(?:transaction|txn)\s*(?:id|no):?\s*([a-z0-9]+)/i,
      /(?:order|voucher)\s*(?:id|no):?\s*([a-z0-9]+)/i,
      
      // Specific formats like "Z179", "INV001", etc.
      /\b([a-z]\d{3,})\b/gi,
      /\b(inv[a-z0-9]+)\b/gi,
      /\b([a-z]{2,4}\d{4,})\b/gi,
      
      // Number after keywords
      /invoice\s*(?:no\.?)?\s*:?\s*([a-z0-9]+)/i,
      /bill\s*(?:no\.?)?\s*:?\s*([a-z0-9]+)/i,
      /receipt\s*(?:no\.?)?\s*:?\s*([a-z0-9]+)/i,
      
      // Counter/cashier patterns
      /counter.*?(\d+)/i,
      /cashier.*?(\d+)/i,
      
      // Line-specific patterns
      /^([a-z]\d{3,})$/gmi, // Lines that are just alphanumeric codes
    ];
    
    const fullText = lines.join(' ');
    
    console.log('🔢 Searching for bill numbers...');
    
    // Try each pattern
    for (const pattern of patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const billNo = match[1];
        if (billNo && billNo.length >= 3 && billNo.length <= 20) {
          // Avoid pure numbers that might be amounts
          if (!/^\d+$/.test(billNo) || billNo.length <= 6) {
            console.log('✅ Found bill number:', billNo.toUpperCase());
            return billNo.toUpperCase();
          }
        }
      }
    }
    
    // Look in individual lines for standalone codes
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[a-z]\d{3,8}$/i.test(trimmed)) {
        console.log('✅ Found standalone bill number:', trimmed.toUpperCase());
        return trimmed.toUpperCase();
      }
    }
    
    console.log('❌ No bill number found');
    return null;
  }

  // Enhanced bill date extraction
  extractBillDate(lines) {
    const datePatterns = [
      // Standard date formats
      /(?:date|bill|invoice).*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/g,
      /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2})/g,
      
      // Time with date
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+\d{1,2}:\d{2}/g,
      
      // Text format dates
      /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4})/i,
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g,
      
      // Reverse format (YYYY-MM-DD)
      /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g,
    ];
    
    const fullText = lines.join(' ');
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const oneYearAhead = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    
    console.log('📅 Searching for bill dates...');
    
    for (const pattern of datePatterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[1];
        const date = this.parseDate(dateStr);
        
        // Check if date is reasonable (within 1 year past to 1 year future)
        if (date && date >= oneYearAgo && date <= oneYearAhead) {
          console.log('✅ Found valid bill date:', date);
          return date;
        }
      }
    }
    
    console.log('❌ No valid bill date found');
    return null;
  }

  // Extract due date
  extractDueDate(lines) {
    const patterns = [
      /due\s*(?:date|by)?:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /pay\s*(?:by|before)?:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /payment\s*due.*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /last\s*date.*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
    ];
    
    const fullText = lines.join(' ');
    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date && date > new Date()) {
          return date;
        }
      }
    }
    
    return null;
  }

  // Enhanced currency detection
  extractCurrency(text) {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('₹') || textLower.includes('rs.') || 
        textLower.includes('rs ') || textLower.includes('inr') || 
        textLower.includes('rupee') || textLower.includes('india')) {
      return 'INR';
    }
    if (textLower.includes('$') || textLower.includes('usd') || textLower.includes('dollar')) {
      return 'USD';
    }
    if (textLower.includes('€') || textLower.includes('eur') || textLower.includes('euro')) {
      return 'EUR';
    }
    
    return 'INR'; // Default to INR for Indian app
  }

  // Extract line items
  extractLineItems(lines) {
    const items = [];
    
    for (const line of lines) {
      const itemMatch = line.match(/(.+?)\s+(\d+)\s+(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)\s+(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i);
      if (itemMatch) {
        const [, description, quantity, unitPrice, totalPrice] = itemMatch;
        items.push({
          description: description.trim(),
          quantity: parseInt(quantity),
          unitPrice: parseFloat(unitPrice),
          totalPrice: parseFloat(totalPrice),
          category: this.categorizeItem(description)
        });
      }
    }
    
    return items;
  }

  // Extract payment details
  extractPaymentDetails(lines) {
    const fullText = lines.join(' ');
    const paymentDetails = {};
    
    const patterns = {
      previousBalance: /previous\s*balance.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i,
      currentCharges: /current\s*charges.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i,
      minimumDue: /minimum\s*due.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i,
      totalDue: /total\s*due.*?(?:rs\.?|₹)\s*(\d+(?:\.\d{2})?)/i
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = fullText.match(pattern);
      if (match) {
        paymentDetails[key] = parseFloat(match[1]);
      }
    }
    
    return paymentDetails;
  }

  // Extract utility data
  extractUtilityData(lines, text) {
    const fullText = lines.join(' ');
    const utilityData = {};
    
    // Account number
    const accountMatch = fullText.match(/account\s*(?:no|number)?:?\s*([a-z0-9]+)/i);
    if (accountMatch) utilityData.accountNumber = accountMatch[1];
    
    // Meter number
    const meterMatch = fullText.match(/meter\s*(?:no|number)?:?\s*([a-z0-9]+)/i);
    if (meterMatch) utilityData.meterNumber = meterMatch[1];
    
    // Service address
    const addressPattern = /(?:service\s*address|billing\s*address):?\s*([^\n]+)/i;
    const addressMatch = fullText.match(addressPattern);
    if (addressMatch) utilityData.serviceAddress = addressMatch[1].trim();
    
    // Consumption data
    const consumptionMatch = fullText.match(/(\d+)\s*(?:units?|kwh|liters?)/i);
    if (consumptionMatch) {
      utilityData.consumption = {
        current: parseInt(consumptionMatch[1]),
        units: 'units'
      };
    }
    
    return utilityData;
  }

  // Helper methods
  categorizeItem(description) {
    const desc = description.toLowerCase();
    if (desc.includes('food') || desc.includes('meal')) return 'food';
    if (desc.includes('drink') || desc.includes('beverage')) return 'beverage';
    if (desc.includes('tax') || desc.includes('gst')) return 'tax';
    if (desc.includes('service') || desc.includes('charge')) return 'service';
    return 'item';
  }
  
  calculateOverallConfidence(words) {
    if (!words || words.length === 0) return 0;
    const totalConfidence = words.reduce((sum, word) => sum + (word.confidence || 0.8), 0);
    return totalConfidence / words.length;
  }
  
  isDateOrNumber(text) {
    return /^\d+([\/\-\.]\d+)*$/.test(text) || /^\d+$/.test(text);
  }

  parseDate(dateStr) {
    try {
      const cleanDateStr = dateStr.replace(/[^\d\/\-\.]/g, '').trim();
      
      const formats = [
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/
      ];
      
      for (const format of formats) {
        const match = cleanDateStr.match(format);
        if (match) {
          const day = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // JS months are 0-indexed
          let year = parseInt(match[3]);
          
          if (year < 100) year += 2000; // Convert 2-digit year
          
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime()) && date.getFullYear() === year) {
            return date;
          }
        }
      }
    } catch (error) {
      console.error('Date parsing error:', error);
    }
    
    return null;
  }

  // Health check method
  async healthCheck() {
    try {
      if (!this.client) {
        return { 
          status: 'error', 
          message: 'Google Cloud Vision client not initialized. Check credentials.',
          hasCredentials: !!(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON || process.env.GOOGLE_CLOUD_KEY_FILE),
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'Not set'
        };
      }
      
      // Test with a minimal request
      const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      
      const request = {
        image: { content: testImage.toString('base64') },
        features: [{ type: 'TEXT_DETECTION' }],
      };
      
      await this.client.annotateImage(request);
      
      return { 
        status: 'healthy', 
        message: 'Google Cloud Vision API is accessible and working',
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        hasCredentials: true
      };
    } catch (error) {
      return { 
        status: 'error', 
        message: `Health check failed: ${error.message}`,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'Not set',
        hasCredentials: !!(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON || process.env.GOOGLE_CLOUD_KEY_FILE)
      };
    }
  }
}

module.exports = new OCRService();