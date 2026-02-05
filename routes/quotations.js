import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create quotation routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllQuotations - Get all quotations function
 * @param {Function} deps.getQuotationById - Get quotation by ID function
 * @param {Function} deps.createQuotation - Create quotation function
 * @param {Function} deps.updateQuotation - Update quotation function
 * @param {Function} deps.deleteQuotation - Delete quotation function
 * @param {Object} deps.upload - Multer upload middleware
 * @param {Function} deps.getNormalizedRelativePath - Path normalization function
 * @param {Function} deps.getSupplierById - Get supplier by ID function
 * @param {Function} deps.linkSupplierToQuotation - Link supplier to quotation function
 * @param {Function} deps.unlinkSupplierFromQuotation - Unlink supplier from quotation function
 * @param {Function} deps.getSuppliersForQuotation - Get suppliers for quotation function
 */
export function createQuotationRoutes(deps) {
  const { getAllQuotations, getQuotationById, createQuotation, updateQuotation, deleteQuotation, upload, getNormalizedRelativePath, getSupplierById, linkSupplierToQuotation, unlinkSupplierFromQuotation, getSuppliersForQuotation } = deps;

  // Get all quotations
  router.get('/', async (req, res) => {
    try {
      const quotations = await getAllQuotations();
      res.json({ success: true, quotations });
    } catch (error) {
      console.error('Error fetching quotations:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotations' });
    }
  });

  // Get quotation by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error fetching quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
    }
  });

  // Create new quotation
  router.post('/', async (req, res) => {
    try {
      const quotationData = req.body;

      // Validate required fields
      if (!quotationData.customerName || !quotationData.productType || !quotationData.quantity) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const quotationId = await createQuotation(quotationData);
      const quotation = await getQuotationById(quotationId);
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to create quotation' });
    }
  });

  // Update quotation
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotationData = req.body;

      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await updateQuotation(id, quotationData);
      const updated = await getQuotationById(id);
      res.json({ success: true, quotation: updated });
    } catch (error) {
      console.error('Error updating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to update quotation' });
    }
  });

  // Delete quotation
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await deleteQuotation(id);
      res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
      console.error('Error deleting quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to delete quotation' });
    }
  });

  // Upload profile image for quotation
  router.post('/:id/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      console.log('=== Profile Image Upload Request ===');
      console.log('Quotation ID:', req.params.id);
      console.log('File received:', req.file ? 'YES' : 'NO');
      if (req.file) {
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        });
      }

      const id = Number(req.params.id);

      if (!req.file) {
        console.error('No file uploaded in request');
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      console.log('Fetching quotation with ID:', id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        console.error('Quotation not found:', id);
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      console.log('Quotation found:', quotation.id, quotation.customerName);

      // Delete old profile image if exists
      if (quotation.profileImagePath) {
        console.log('Deleting old profile image:', quotation.profileImagePath);
        try {
          await fs.unlink(path.join(__dirname, '..', quotation.profileImagePath));
          console.log('Old profile image deleted successfully');
        } catch (error) {
          console.warn('Failed to delete old profile image:', error.message);
        }
      }

      // Update quotation with new profile image path
      console.log('Calculating relative path for:', req.file.path);
      const relativePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      console.log('Relative path:', relativePath);

      console.log('Updating quotation with profile image path');
      await updateQuotation(id, { ...quotation, profileImagePath: relativePath });
      console.log('Quotation updated successfully');

      console.log('=== Profile Image Upload Success ===');
      res.json({
        success: true,
        profileImagePath: relativePath,
        message: 'Profile image uploaded successfully'
      });
    } catch (error) {
      console.error('=== Profile Image Upload Error ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({ success: false, error: 'Failed to upload profile image', details: error.message });
    }
  });

  // Upload attachments for quotation
  router.post('/:id/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Get relative paths for uploaded files
      const newAttachmentPaths = req.files.map(file => getNormalizedRelativePath(path.join(__dirname, '..'), file.path));

      // Combine existing attachments with new ones
      const allAttachmentPaths = [...quotation.attachmentPaths, ...newAttachmentPaths];

      // Update quotation with new attachment paths
      await updateQuotation(id, { ...quotation, attachmentPaths: allAttachmentPaths });

      res.json({
        success: true,
        attachmentPaths: newAttachmentPaths,
        allAttachmentPaths: allAttachmentPaths,
        message: `${req.files.length} attachment(s) uploaded successfully`
      });
    } catch (error) {
      console.error('Error uploading attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // Delete attachment from quotation
  router.delete('/:id/attachments/:filename', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const filename = req.params.filename;

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Find and remove the attachment
      const attachmentIndex = quotation.attachmentPaths.findIndex(path => path.includes(filename));
      if (attachmentIndex === -1) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      const filePath = quotation.attachmentPaths[attachmentIndex];
      const fullPath = path.join(__dirname, '..', filePath);

      // Delete file from filesystem
      try {
        await fs.unlink(fullPath);
      } catch (error) {
        console.warn('Failed to delete file from filesystem:', error);
      }

      // Remove from database
      const updatedAttachments = quotation.attachmentPaths.filter((_, index) => index !== attachmentIndex);
      await updateQuotation(id, { ...quotation, attachmentPaths: updatedAttachments });

      res.json({ success: true, message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({ success: false, error: 'Failed to delete attachment' });
    }
  });

  // Temporary profile image upload (for new quotations)
  router.post('/temp/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const relativePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      res.json({
        success: true,
        profileImagePath: relativePath,
        message: 'Profile image uploaded temporarily'
      });
    } catch (error) {
      console.error('Error uploading temporary profile image:', error);
      res.status(500).json({ success: false, error: 'Failed to upload profile image' });
    }
  });

  // Temporary attachments upload (for new quotations)
  router.post('/temp/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const attachmentPaths = req.files.map(file => getNormalizedRelativePath(path.join(__dirname, '..'), file.path));
      res.json({
        success: true,
        attachmentPaths: attachmentPaths,
        message: `${req.files.length} attachment(s) uploaded temporarily`
      });
    } catch (error) {
      console.error('Error uploading temporary attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // Link supplier to quotation
  router.post('/:id/suppliers/:supplierId', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.params.supplierId);

      const quotation = await getQuotationById(quotationId);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      const supplier = await getSupplierById(supplierId);
      if (!supplier) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }

      await linkSupplierToQuotation(quotationId, supplierId);
      res.json({ success: true, message: 'Supplier linked to quotation' });
    } catch (error) {
      console.error('Error linking supplier to quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to link supplier' });
    }
  });

  // Unlink supplier from quotation
  router.delete('/:id/suppliers/:supplierId', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.params.supplierId);

      await unlinkSupplierFromQuotation(quotationId, supplierId);
      res.json({ success: true, message: 'Supplier unlinked from quotation' });
    } catch (error) {
      console.error('Error unlinking supplier from quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to unlink supplier' });
    }
  });

  // Get suppliers for quotation
  router.get('/:id/suppliers', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const suppliers = await getSuppliersForQuotation(quotationId);
      res.json({ success: true, suppliers });
    } catch (error) {
      console.error('Error fetching suppliers for quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  });

  return router;
}
