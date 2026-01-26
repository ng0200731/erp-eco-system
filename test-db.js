import { getAllQuotations, createQuotation, getQuotationById } from './db/tasksDb.js';

async function testDatabase() {
  try {
    console.log('Testing database...');

    // Create a test quotation with file paths
    const testQuotation = {
      customerName: 'Test Customer',
      contactPerson: 'Test Contact',
      email: 'test@example.com',
      phone: '12345678',
      productType: 'hang-tag',
      productDetails: { material: 'paper', size: '2x3 inches' },
      quantity: 100,
      unitPrice: 0.50,
      total: 50.00,
      notes: 'Test quotation',
      profileImagePath: 'uploads/profile-images/test-image.jpg',
      attachmentPaths: ['uploads/attachments/test-doc.pdf', 'uploads/attachments/test-image.png'],
      dateCreated: new Date().toISOString(),
      status: 'draft'
    };

    console.log('Creating quotation...');
    const quotationId = await createQuotation(testQuotation);
    console.log('Created quotation with ID:', quotationId);

    console.log('Retrieving quotation...');
    const retrievedQuotation = await getQuotationById(quotationId);
    console.log('Retrieved quotation:', {
      id: retrievedQuotation.id,
      customerName: retrievedQuotation.customerName,
      profileImagePath: retrievedQuotation.profileImagePath,
      attachmentPaths: retrievedQuotation.attachmentPaths
    });

    console.log('Getting all quotations...');
    const allQuotations = await getAllQuotations();
    console.log('Total quotations:', allQuotations.length);
    console.log('Last quotation file data:', {
      profileImagePath: allQuotations[0]?.profileImagePath,
      attachmentPaths: allQuotations[0]?.attachmentPaths
    });

    console.log('Database test completed successfully!');
  } catch (error) {
    console.error('Database test failed:', error);
  }
}

testDatabase();



