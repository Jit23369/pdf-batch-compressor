const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const compression = require('compression');

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;
const USE_GHOSTSCRIPT = process.env.USE_GHOSTSCRIPT !== 'false';

// Create directories
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

[uploadsDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
});

// Check Ghostscript availability
async function checkGhostscript() {
  if (!USE_GHOSTSCRIPT) return false;
  
  try {
    await execPromise('gs --version');
    console.log('✓ Ghostscript detected - using advanced compression');
    return true;
  } catch (error) {
    console.log('⚠ Ghostscript not found - using basic compression');
    return false;
  }
}

// Compress PDF with Ghostscript
async function compressPDFWithGhostscript(inputPath, compressionRatio) {
  const outputPath = path.join(outputDir, `gs_${Date.now()}.pdf`);
  
  // Map compression ratio to Ghostscript quality settings
  let quality = 'ebook'; // Default quality
  if (compressionRatio > 0.5) {
    quality = 'printer'; // High quality, less compression
  } else if (compressionRatio > 0.3) {
    quality = 'ebook'; // Balanced
  } else {
    quality = 'screen'; // Low quality, high compression
  }

  const command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/${quality} -dNOPAUSE -dQUIET -dBATCH -dDetectDuplicateImages -r150x150 -sOutputFile="${outputPath}" "${inputPath}"`;

  try {
    await execPromise(command, { timeout: 60000 });
    const compressedData = fs.readFileSync(outputPath);
    fs.unlinkSync(outputPath);
    return compressedData;
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw new Error(`Ghostscript compression failed: ${error.message}`);
  }
}

// Compress PDF with pdf-lib (basic)
async function compressPDFBasic(inputPath) {
  try {
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Remove metadata and optimize
    pdfDoc.removePages();
    
    const compressedBytes = await pdfDoc.save();
    return compressedBytes;
  } catch (error) {
    throw new Error(`PDF compression failed: ${error.message}`);
  }
}

// Main compression function
async function compressPDF(inputPath, compressionRatio) {
  const inputSize = fs.statSync(inputPath).size;
  const targetSize = Math.round(inputSize * compressionRatio);

  try {
    // Try Ghostscript first (better quality)
    if (USE_GHOSTSCRIPT) {
      try {
        const compressedData = await compressPDFWithGhostscript(inputPath, compressionRatio);
        
        // Verify compression ratio
        const achievedRatio = compressedData.length / inputSize;
        if (achievedRatio > 0.95) {
          // If compression is insufficient, try lower quality
          console.warn(`Ghostscript compression ineffective (${Math.round(achievedRatio * 100)}%), falling back to basic compression`);
          return await compressPDFBasic(inputPath);
        }
        
        return compressedData;
      } catch (error) {
        console.warn(`Ghostscript compression failed: ${error.message}, falling back to basic compression`);
        return await compressPDFBasic(inputPath);
      }
    } else {
      return await compressPDFBasic(inputPath);
    }
  } catch (error) {
    throw new Error(`PDF compression failed: ${error.message}`);
  }
}

// Health check
app.get('/api/health', async (req, res) => {
  const hasGhostscript = await checkGhostscript();
  res.json({
    status: 'OK',
    message: 'PDF Compressor Service is running',
    ghostscript: hasGhostscript,
    timestamp: new Date().toISOString(),
  });
});

// Single file compression
app.post('/api/compress-pdf', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const compressionRatio = parseFloat(req.body.compressionRatio) || 0.2;

    if (compressionRatio <= 0 || compressionRatio >= 1) {
      return res.status(400).json({ error: 'Compression ratio must be between 0 and 1' });
    }

    const inputSize = req.file.size;
    const compressedPdfBytes = await compressPDF(req.file.path, compressionRatio);
    const outputSize = compressedPdfBytes.length;
    const actualRatio = Math.round((1 - outputSize / inputSize) * 100);
    const processingTime = Date.now() - startTime;

    // Clean up
    fs.unlinkSync(req.file.path);

    // Send response
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      originalName: req.file.originalname,
      originalSize: inputSize,
      compressedSize: outputSize,
      compressionRatio: actualRatio,
      processingTime: processingTime,
      data: Buffer.from(compressedPdfBytes).toString('base64'),
    });
  } catch (error) {
    console.error('Compression error:', error);

    // Clean up
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'PDF compression failed',
      message: error.message,
    });
  }
});

// Batch compression
app.post('/api/compress-batch', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const compressionRatio = parseFloat(req.body.compressionRatio) || 0.2;
    const results = [];

    for (const file of req.files) {
      const startTime = Date.now();
      try {
        const compressedPdfBytes = await compressPDF(file.path, compressionRatio);
        const originalSize = file.size;
        const compressedSize = compressedPdfBytes.length;
        const processingTime = Date.now() - startTime;

        results.push({
          success: true,
          originalName: file.originalname,
          originalSize: originalSize,
          compressedSize: compressedSize,
          compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
          processingTime: processingTime,
          data: Buffer.from(compressedPdfBytes).toString('base64'),
        });

        fs.unlinkSync(file.path);
      } catch (error) {
        results.push({
          success: false,
          originalName: file.originalname,
          error: error.message,
        });

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json({ files: results });
  } catch (error) {
    console.error('Batch compression error:', error);
    res.status(500).json({
      error: 'Batch compression failed',
      message: error.message,
    });
  }
});

// Get compression stats
app.get('/api/stats', (req, res) => {
  const uploadsSize = fs.readdirSync(uploadsDir).reduce((total, file) => {
    return total + fs.statSync(path.join(uploadsDir, file)).size;
  }, 0);

  res.json({
    uploadedFilesSize: uploadsSize,
    uploadsCount: fs.readdirSync(uploadsDir).length,
    serverTime: new Date().toISOString(),
  });
});

// Clean up temp files (files older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  [uploadsDir, outputDir].forEach(dir => {
    fs.readdirSync(dir).forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (now - stat.mtimeMs > maxAge) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete ${filePath}:`, error);
        }
      }
    });
  });
}, 30 * 60 * 1000); // Check every 30 minutes

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ error: 'File size exceeds 150MB limit' });
    }
    return res.status(400).json({ error: error.message });
  }

  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({ error: 'Only PDF files are allowed' });
  }

  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error', message: error.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║   PDF Batch Compressor Server v1.0     ║
╚════════════════════════════════════════╝

Server running on port ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
  `);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Stats endpoint: http://localhost:${PORT}/api/stats`);
  
  await checkGhostscript();
});

module.exports = app;
