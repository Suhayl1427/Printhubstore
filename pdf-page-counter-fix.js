/**
 * PDF Page Counter - Complete Solution
 * Fix for PDF always counting as 1 page issue
 */

// ============================================
// npm install commands:
// npm install pdf-parse@^1.4.5 pdf-lib@^1.17.1
// ============================================

// ============================================
// IMPORTS
// ============================================
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');

// ============================================
// CONFIG
// ============================================
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================
// DEBUG LOGGING
// ============================================
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [PDF] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [PDF] ${message}`);
  }
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [PDF-ERROR] ${message}`);
  console.error(`[${timestamp}] [PDF-ERROR] Stack: ${error.stack}`);
}

// ============================================
// PDF PAGE COUNT FUNCTION
// ============================================

/**
 * Count pages in a PDF buffer using pdf-parse
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<number>} - Number of pages
 */
async function countPdfPages(buffer) {
  log('Starting page count', { bufferSize: buffer.length });

  try {
    // Validate buffer
    if (!buffer || buffer.length < 100) {
      logError('Buffer too small or empty', new Error('Invalid buffer'));
      return 0;
    }

    // Check PDF header
    const pdfHeader = buffer.slice(0, 4).toString('ascii');
    log('PDF Header check', { header: pdfHeader });

    if (pdfHeader !== '%PDF') {
      log('Invalid PDF header - not a valid PDF');
      return 0;
    }

    // Method 1: Use pdf-parse with buffer (NOT path)
    log('Using pdf-parse...');
    const parseResult = await pdfParse(buffer);
    
    log('pdf-parse result', {
      numpages: parseResult.numpages,
      pagecount: parseResult.pagecount,
      numrender: parseResult.numrender
    });

    // Check for numpages (correct property name)
    if (typeof parseResult.numpages === 'number' && parseResult.numpages > 0) {
      log('SUCCESS: pdf-parse returned pages', { pages: parseResult.numpages });
      return parseResult.numpages;
    }

    // Check for pagecount (alternative)
    if (typeof parseResult.pagecount === 'number' && parseResult.pagecount > 0) {
      log('SUCCESS: pdf-parse pagecount', { pages: parseResult.pagecount });
      return parseResult.pagecount;
    }

    // Method 2: Fallback to pdf-lib
    log('pdf-parse failed, trying pdf-lib...');
    try {
      const pdfDoc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        updateMetadata: false
      });
      const pageCount = pdfDoc.getPageCount();
      log('pdf-lib result', { pages: pageCount });
      return pageCount;
    } catch (pdfLibError) {
      logError('pdf-lib failed', pdfLibError);
    }

    // Method 3: Manual parsing (look for /Count N in PDF structure)
    log('Trying manual PDF parsing...');
    try {
      const pdfString = buffer.toString('latin1');
      
      // Look for /Count pattern in catalog
      const countMatch = pdfString.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        const count = parseInt(countMatch[1], 10);
        log('Found /Count in PDF', { count });
        if (count > 0 && count < 10000) {
          return count;
        }
      }
    } catch (manualError) {
      logError('Manual parsing failed', manualError);
    }

    // If all methods fail, return 0 (no fallback to 1)
    log('ALL METHODS FAILED - returning 0');
    return 0;

  } catch (error) {
    logError('Error counting PDF pages', error);
    return 0;
  }
}

// ============================================
// MULTI-FILE PAGE COUNT LOGIC
// ============================================

/**
 * Process multiple PDF files and count total pages
 * @param {Array} files - Array of multer file objects
 * @returns {Promise<Object>} - { totalPages, fileDetails }
 */
async function processMultiplePdfs(files) {
  log('Processing multiple PDFs', { fileCount: files.length });

  let totalPages = 0;
  const fileDetails = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    log(`Processing file ${i + 1}/${files.length}`, {
      originalname: file.originalname,
      size: file.size
    });

    try {
      // Read file buffer (NOT using path)
      const buffer = await fs.promises.readFile(file.path);
      log('File buffer read', { size: buffer.length });

      // Count pages using buffer
      const pageCount = await countPdfPages(buffer);
      
      log(`File result: ${file.originalname}`, {
        pages: pageCount,
        path: file.path
      });

      totalPages += pageCount;

      fileDetails.push({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        pages: pageCount
      });

    } catch (error) {
      logError(`Error processing file: ${file.originalname}`, error);
      fileDetails.push({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        pages: 0,
        error: error.message
      });
    }
  }

  log('Multi-file processing complete', {
    totalPages,
    fileCount: files.length,
    files: fileDetails.map(f => ({ name: f.originalName, pages: f.pages }))
  });

  return { totalPages, fileDetails };
}

// ============================================
// TEST SCRIPT
// ============================================

async function testPageCounter() {
  console.log('\n========================================');
  console.log('PDF PAGE COUNTER TEST');
  console.log('========================================\n');

  // Create test PDFs directory
  const testDir = path.join(__dirname, 'test-pdfs');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`Created test directory: ${testDir}`);
    console.log('Please add PDF files to test directory and run again.\n');
    return;
  }

  // Find test PDFs
  const testFiles = fs.readdirSync(testDir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(testDir, f));

  if (testFiles.length === 0) {
    console.log('No PDF files found in test-pdfs directory.');
    console.log('Add some PDF files to test-pdfs folder and run again.\n');
    return;
  }

  console.log(`Found ${testFiles.length} test PDF(s)\n`);

  // Test each PDF
  for (const pdfPath of testFiles) {
    const filename = path.basename(pdfPath);
    console.log(`Testing: ${filename}`);
    console.log('-'.repeat(40));

    try {
      const buffer = await fs.promises.readFile(pdfPath);
      const pages = await countPdfPages(buffer);
      console.log(`Result: ${pages} page(s)\n`);
    } catch (error) {
      console.log(`Error: ${error.message}\n`);
    }
  }

  console.log('========================================');
  console.log('TEST COMPLETE');
  console.log('========================================\n');
}

// Run test if executed directly
if (require.main === module) {
  testPageCounter();
}

// Export for use in server.js
module.exports = {
  countPdfPages,
  processMultiplePdfs,
  log,
  logError
};

