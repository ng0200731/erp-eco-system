import express from 'express';

const router = express.Router();

/**
 * Create customer routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllCustomers - Get all customers function
 * @param {Function} deps.getCustomerById - Get customer by ID function
 * @param {Function} deps.createCustomer - Create customer function
 * @param {Function} deps.updateCustomer - Update customer function
 * @param {Function} deps.deleteCustomer - Delete customer function
 * @param {Function} deps.createCustomerMember - Create customer member function
 */
export function createCustomerRoutes(deps) {
  const { getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, createCustomerMember } = deps;

  // Get all customers
  router.get('/', async (req, res) => {
    try {
      const customers = await getAllCustomers();
      res.json({ success: true, customers });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch customers' });
    }
  });

  // Get customer by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customer = await getCustomerById(id);
      if (!customer) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }
      res.json({ success: true, customer });
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch customer' });
    }
  });

  // Create new customer
  router.post('/', async (req, res) => {
    try {
      const customerData = req.body;

      // Validate required fields
      if (!customerData.companyName || !customerData.emailDomain || !customerData.companyType) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const customerId = await createCustomer(customerData);

      // Create members if provided
      if (customerData.members && Array.isArray(customerData.members)) {
        for (const member of customerData.members) {
          await createCustomerMember(customerId, member);
        }
      }

      const customer = await getCustomerById(customerId);
      res.json({ success: true, customer });
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ success: false, error: 'Failed to create customer' });
    }
  });

  // Update customer
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customerData = req.body;

      const existing = await getCustomerById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      await updateCustomer(id, customerData);
      const updated = await getCustomerById(id);
      res.json({ success: true, customer: updated });
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ success: false, error: 'Failed to update customer' });
    }
  });

  // Delete customer
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getCustomerById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      await deleteCustomer(id);
      res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ success: false, error: 'Failed to delete customer' });
    }
  });

  return router;
}
