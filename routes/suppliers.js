import express from 'express';

const router = express.Router();

/**
 * Create supplier routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllSuppliers - Get all suppliers function
 * @param {Function} deps.getSupplierById - Get supplier by ID function
 * @param {Function} deps.createSupplier - Create supplier function
 * @param {Function} deps.updateSupplier - Update supplier function
 * @param {Function} deps.deleteSupplier - Delete supplier function
 * @param {Function} deps.createSupplierMember - Create supplier member function
 */
export function createSupplierRoutes(deps) {
  const { getAllSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier, createSupplierMember } = deps;

  // Get all suppliers
  router.get('/', async (req, res) => {
    try {
      const suppliers = await getAllSuppliers();
      res.json({ success: true, suppliers });
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  });

  // Get supplier by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const supplier = await getSupplierById(id);
      if (!supplier) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }
      res.json({ success: true, supplier });
    } catch (error) {
      console.error('Error fetching supplier:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch supplier' });
    }
  });

  // Create new supplier
  router.post('/', async (req, res) => {
    try {
      const supplierData = req.body;

      // Validate required fields
      if (!supplierData.companyName || !supplierData.emailDomain || !supplierData.companyType) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const supplierId = await createSupplier(supplierData);

      // Create members if provided
      if (supplierData.members && Array.isArray(supplierData.members)) {
        for (const member of supplierData.members) {
          await createSupplierMember(supplierId, member);
        }
      }

      const supplier = await getSupplierById(supplierId);
      res.json({ success: true, supplier });
    } catch (error) {
      console.error('Error creating supplier:', error);
      res.status(500).json({ success: false, error: 'Failed to create supplier' });
    }
  });

  // Update supplier
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const supplierData = req.body;

      const existing = await getSupplierById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }

      await updateSupplier(id, supplierData);
      const updated = await getSupplierById(id);
      res.json({ success: true, supplier: updated });
    } catch (error) {
      console.error('Error updating supplier:', error);
      res.status(500).json({ success: false, error: 'Failed to update supplier' });
    }
  });

  // Delete supplier
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getSupplierById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }

      await deleteSupplier(id);
      res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      res.status(500).json({ success: false, error: 'Failed to delete supplier' });
    }
  });

  return router;
}
