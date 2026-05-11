/**
 * PDF Page Counter - 1 PDF Page = 1 Page
 * Express + Multer + pdf-parse
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Count pages: 1 PDF page = 1 page
async function countPdfPages(buffer) {
  const data = await pdfParse(buffer);
  return data.numpages; // Each PDF page = 1 page
}

// Upload multiple PDFs
app.post('/api/orders', upload.array('files', 10), async (req, res) => {
  const files = req.files;
  let totalPages = 0;

  for (const file of files) {
    const buffer = await fs.promises.readFile(file.path);
    const pages = await countPdfPages(buffer);
    
    console.log(`${file.originalname}: ${pages} page(s)`);
    totalPages += pages;
  }

  console.log(`Total: ${totalPages} page(s)`);

  res.json({
    success: true,
    totalPages: totalPages
  });
});

app.listen(3000, () => console.log('Server running on 3000'));

