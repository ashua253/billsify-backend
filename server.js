const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/billapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas successfully!');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/ocr', require('./routes/ocr')); // New OCR routes

// Health check with OCR status
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'OK', 
    message: 'Billsify Backend Server with OCR is running',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    features: {
      ocr: {
        enabled: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
        provider: 'Google Cloud Vision API'
      },
      imageUpload: {
        enabled: true,
        maxSize: '10MB'
      }
    }
  };
  
  res.json(healthStatus);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  // Handle multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      error: 'File too large. Maximum size allowed is 10MB.' 
    });
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({ 
      error: 'Invalid file type. Please upload an image file.' 
    });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Billsify Backend Server with OCR is running on port ${PORT}`);
  console.log(`📍 Health check available at: http://localhost:${PORT}/api/health`);
  console.log(`🔍 OCR endpoints available at: http://localhost:${PORT}/api/ocr/*`);
  
  // Log OCR configuration status
  if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.log('✅ Google Cloud Vision OCR is configured');
  } else {
    console.log('⚠️  Google Cloud Vision OCR is NOT configured. Set GOOGLE_CLOUD_PROJECT_ID and GOOGLE_CLOUD_KEY_FILE environment variables.');
  }
});