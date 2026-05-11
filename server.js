// ============================================
// LOAD ENVIRONMENT VARIABLES
// ============================================
require('dotenv').config();

// ============================================
// IMPORTS
// ============================================
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Import Order model
const Order = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// TRACKING ID GENERATOR
// ============================================

/**
 * Generate a simple tracking ID like ID001, ID002, ID0002
 * Uses a counter stored in a file to maintain sequence
 */
async function generateTrackingId() {
  const counterFile = path.join(__dirname, 'data', 'order-counter.json');
  const dataDir = path.join(__dirname, 'data');
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  let counter = 1;
  
  // Read current counter
  if (fs.existsSync(counterFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
      counter = (data.counter || 0) + 1;
    } catch (e) {
      counter = 1;
    }
  }
  
  // Save new counter
  fs.writeFileSync(counterFile, JSON.stringify({ counter }, null, 2));
  
  // Generate tracking ID with zero-padding (ID001, ID002, ... ID010, ID011, etc.)
  const trackingId = `ID${String(counter).padStart(3, '0')}`;
  return trackingId;
}

// ============================================
// PDF-PAGE-COUNT LIBRARY (More reliable than pdf-parse)
// ============================================
const pdfLib = require('pdf-lib');

// ============================================
// ADMIN CREDENTIALS
// ============================================
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

const adminSessions = new Map();

// ============================================
// EXPRESS STATIC CONFIGURATION
// ============================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MULTER CONFIGURATION
// ============================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================
// PDF PAGE COUNT FUNCTION
// ============================================

// Require pdf-parse at the top level
const pdfParse = require('pdf-parse');

/**
 * Count pages in a PDF file using pdf-lib with pdf-parse fallback
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<number>} - Number of pages
 */
async function countPdfPages(pdfPath) {
  console.log(`[PDF] Counting pages for: ${pdfPath}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.warn(`[PDF] File not found: ${pdfPath}`);
      return 1;
    }

    // Read file buffer
    const fileBuffer = await fs.promises.readFile(pdfPath);
    console.log(`[PDF] File size: ${fileBuffer.length} bytes`);
    
    // Check if file is valid PDF (starts with %PDF)
    if (fileBuffer.length < 5) {
      console.warn(`[PDF] File too small to be valid PDF`);
      return 1;
    }
    
    const pdfHeader = fileBuffer.slice(0, 4).toString('ascii');
    console.log(`[PDF] PDF header: ${pdfHeader}`);
    
    if (pdfHeader !== '%PDF') {
      console.warn(`[PDF] Invalid PDF header`);
      return 1;
    }

    // Method 1: Try pdf-lib first
    try {
      console.log(`[PDF] Trying pdf-lib...`);
      const pdfDoc = await pdfLib.PDFDocument.load(fileBuffer, {
        ignoreEncryption: true,
        updateMetadata: false
      });
      const pageCount = pdfDoc.getPageCount();
      console.log(`[PDF] pdf-lib result: ${pageCount} pages`);
      if (pageCount > 0) {
        return pageCount;
      }
    } catch (pdfLibError) {
      console.warn(`[PDF] pdf-lib failed: ${pdfLibError.message}`);
    }

    // Method 2: Use pdf-parse with correct buffer handling
    try {
      console.log(`[PDF] Trying pdf-parse...`);
      const parseResult = await pdfParse(fileBuffer);
      console.log(`[PDF] pdf-parse raw result:`, parseResult);
      
      if (parseResult && typeof parseResult.numpages === 'number') {
        console.log(`[PDF] pdf-parse result: ${parseResult.numpages} pages`);
        return parseResult.numpages;
      }
      
      if (parseResult && typeof parseResult.pageCount === 'number') {
        console.log(`[PDF] pdf-parse pageCount: ${parseResult.pageCount} pages`);
        return parseResult.pageCount;
      }
    } catch (parseError) {
      console.warn(`[PDF] pdf-parse failed: ${parseError.message}`);
    }

    // Method 3: Parse PDF structure manually
    try {
      console.log(`[PDF] Trying manual PDF parsing...`);
      const pdfString = fileBuffer.toString('latin1');
      
      // Look for /Count N pattern in PDF catalog
      const countMatch = pdfString.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        const count = parseInt(countMatch[1], 10);
        console.log(`[PDF] Found /Count ${count} in PDF`);
        if (count > 0 && count < 10000) { // Reasonable page count limit
          return count;
        }
      }
      
      // Count /Page objects
      const pageMatches = pdfString.match(/\/Page\s*[^\w]/g);
      if (pageMatches) {
        const count = pageMatches.length;
        console.log(`[PDF] Found ${count} /Page objects`);
        return count;
      }
    } catch (manualError) {
      console.warn(`[PDF] Manual parsing failed: ${manualError.message}`);
    }

    // Last resort: default to 1
    console.warn(`[PDF] All methods failed, defaulting to 1 page`);
    return 1;
    
  } catch (error) {
    console.error(`[PDF] Error counting pages: ${error.message}`);
    console.error(`[PDF] Stack: ${error.stack}`);
    return 1;
  }
}

// ============================================
// MONGODB ATLAS CONNECTION
// ============================================

async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGO_URI is not defined in .env file');
      console.log('📝 Please create a .env file with your MongoDB Atlas connection string');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

// ============================================
// PAGE ROUTES
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

app.get('/tracking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================
// ADMIN API ROUTES
// ============================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username and password are required' 
    });
  }

  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const sessionId = uuidv4();
    adminSessions.set(sessionId, { username, createdAt: Date.now() });
    
    res.json({
      success: true,
      message: 'Login successful',
      sessionId: sessionId
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid username or password'
    });
  }
});

app.get('/api/admin/check', (req, res) => {
  const sessionId = req.headers['x-admin-session'] || req.query.session;
  
  if (sessionId && adminSessions.has(sessionId)) {
    const session = adminSessions.get(sessionId);
    
    if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
      return res.json({ isAdmin: true, username: session.username });
    } else {
      adminSessions.delete(sessionId);
    }
  }
  
  res.json({ isAdmin: false });
});

app.post('/api/admin/logout', (req, res) => {
  const sessionId = req.headers['x-admin-session'] || req.body.session;
  
  if (sessionId && adminSessions.has(sessionId)) {
    adminSessions.delete(sessionId);
  }
  
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const printingOrders = await Order.countDocuments({ status: 'Printing' });
    const completedOrders = await Order.countDocuments({ status: 'Completed' });

    res.json({
      totalOrders,
      pendingOrders,
      printingOrders,
      completedOrders,
      newOrders: []
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// ORDER API ROUTES
// ============================================

// POST /api/analyze-pdf - Analyze PDF and count pages
app.post('/api/analyze-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pdfPath = req.file.path;
    const pageCount = await countPdfPages(pdfPath);
    const price = pageCount * 2;

    console.log(`📄 Analyzed: ${req.file.originalname} - ${pageCount} pages - ₹${price}`);

    res.json({
      success: true,
      pages: pageCount,
      price: price,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    res.status(500).json({ error: 'Failed to analyze PDF: ' + error.message });
  }
});

// POST /api/orders - Create new order
app.post('/api/orders', upload.array('files', 10), async (req, res) => {
  try {
    const { customerName, phone, copies, binding } = req.body;
    const files = req.files;

    if (!customerName || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    let totalPages = 0;
    const fileDetails = [];

    // Process each uploaded file
    for (const file of files) {
      const pageCount = await countPdfPages(file.path);
      totalPages += pageCount;
      
      fileDetails.push({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        pages: pageCount
      });
      
      console.log(`📄 File: ${file.originalname} - ${pageCount} pages`);
    }

    const numCopies = parseInt(copies) || 1;
    const hasBinding = binding === 'true' || binding === true;
    const totalPrice = totalPages * numCopies * 2 + (hasBinding ? 50 : 0);

    // Generate tracking ID
    const trackingId = await generateTrackingId();

    const order = new Order({
      trackingId: trackingId,
      customerName,
      phone,
      files: fileDetails,
      totalPages: totalPages,
      copies: numCopies,
      binding: hasBinding,
      totalPrice: totalPrice,
      status: 'Pending'
    });

    await order.save();
    console.log(`✅ Order saved: ${trackingId} - ${customerName} (${files.length} files, ${totalPages} pages)`);

    res.json({
      success: true,
      orderId: trackingId,
      message: 'Order placed successfully!'
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order: ' + error.message });
  }
});

// GET /api/orders - Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id - Get single order by trackingId or _id
app.get('/api/orders/:id', async (req, res) => {
  try {
    let order;
    // Try finding by trackingId first
    order = await Order.findOne({ trackingId: req.params.id });
    
    // If not found, try finding by _id (for backward compatibility)
    if (!order) {
      try {
        order = await Order.findById(req.params.id);
      } catch (e) {
        // Invalid ObjectId format
      }
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:id/status - Update order status by trackingId or _id
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Printing', 'Processing', 'Ready', 'Completed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let order;
    // Try finding by trackingId first
    order = await Order.findOneAndUpdate(
      { trackingId: req.params.id },
      { status },
      { new: true }
    );
    
    // If not found, try finding by _id
    if (!order) {
      try {
        order = await Order.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true }
        );
      } catch (e) {
        // Invalid ObjectId format
      }
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, message: 'Status updated', order });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/orders/:id - Delete order by trackingId or _id
app.delete('/api/orders/:id', async (req, res) => {
  try {
    let order;
    // Try finding by trackingId first
    order = await Order.findOne({ trackingId: req.params.id });
    
    // If not found, try finding by _id
    if (!order) {
      try {
        order = await Order.findById(req.params.id);
      } catch (e) {
        // Invalid ObjectId format
      }
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.files && order.files.length > 0) {
      for (const file of order.files) {
        try {
          const filePath = path.join(__dirname, file.path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.warn(`Could not delete file: ${file.path}`);
        }
      }
    }

    // Delete by _id to ensure we delete the right document
    await Order.findByIdAndDelete(order._id);
    res.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// GET /api/files/:filename - Serve uploaded files
app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 50MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 PrintHub Server running at http://localhost:${PORT}`);
    console.log(`📋 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`📦 Place Order: http://localhost:${PORT}/order`);
    console.log(`🔍 Track Order: http://localhost:${PORT}/tracking`);
  });
}

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

startServer();
