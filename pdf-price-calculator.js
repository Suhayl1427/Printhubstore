/**
 * PDF Page Counter + Price Calculator
 * Count pages when uploaded, calculate price per page
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const app = express();
const upload = multer({ dest: 'uploads/' });

const PRICE_PER_PAGE = 2; // ₹2 per page
const BINDING_PRICE = 50; // ₹50 extra for binding

// Count pages: 1 PDF page = 1 page
async function countPdfPages(buffer) {
  const data = await pdfParse(buffer);
  return data.numpages;
}

// Calculate price based on pages
function calculatePrice(pages, copies, hasBinding) {
  const printCost = pages * copies * PRICE_PER_PAGE;
  const bindingCost = hasBinding ? BINDING_PRICE : 0;
  return printCost + bindingCost;
}

// Upload + Count Pages + Calculate Price
app.post('/api/orders', upload.array('files', 10), async (req, res) => {
  const { copies, binding } = req.body;
  const files = req.files;
  
  let totalPages = 0;
  const fileDetails = [];

  for (const file of files) {
    const buffer = await fs.promises.readFile(file.path);
    const pages = await countPdfPages(buffer);
    
    totalPages += pages;
    
    fileDetails.push({
      filename: file.originalname,
      pages: pages
    });
    
    console.log(`${file.originalname}: ${pages} page(s)`);
  }

  const numCopies = parseInt(copies) || 1;
  const hasBinding = binding === 'true';
  const totalPrice = calculatePrice(totalPages, numCopies, hasBinding);

  console.log(`\nTotal Pages: ${totalPages}`);
  console.log(`Copies: ${numCopies}`);
  console.log(`Binding: ${hasBinding ? 'Yes (+₹50)' : 'No'}`);
  console.log(`Total Price: ₹${totalPrice}\n`);

  res.json({
    success: true,
    files: fileDetails,
    totalPages: totalPages,
    price: {
      perPage: PRICE_PER_PAGE,
      copies: numCopies,
      binding: hasBinding ? BINDING_PRICE : 0,
      total: totalPrice
    }
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

