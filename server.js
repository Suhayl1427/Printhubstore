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
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
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
// FAST PDF PAGE COUNT FUNCTION
// ============================================


async function countPdfPages(pdfPath) {

  try {

    // Read PDF buffer
    const buffer = fs.readFileSync(pdfPath);

    // METHOD 1 — pdf-lib (FAST)
    try {

      const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: true
      });

      const pages = pdfDoc.getPageCount();

      console.log('pdf-lib pages:', pages);

      if (pages && pages > 0) {
        return pages;
      }

    } catch (err) {

      console.log('pdf-lib failed:', err.message);
    }

    // METHOD 2 — pdf-parse (ACCURATE)
    try {

      const data = await pdfParse(buffer);

      console.log('pdf-parse pages:', data.numpages);

      if (data.numpages && data.numpages > 0) {
        return data.numpages;
      }

    } catch (err) {

      console.log('pdf-parse failed:', err.message);
    }

    // METHOD 3 — manual regex fallback
    try {

      const pdfText = buffer.toString('latin1');

      const matches = pdfText.match(/\/Type\s*\/Page[^s]/g);

      if (matches && matches.length > 0) {

        console.log('manual pages:', matches.length);

        return matches.length;
      }

    } catch (err) {

      console.log('manual parser failed');
    }

    return 1;

  } catch (error) {

    console.error('PDF COUNT ERROR:', error);

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
