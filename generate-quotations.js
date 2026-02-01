// Configuration
const API_BASE_URL = 'http://localhost:3001';
const NUM_QUOTATIONS = 200;

// Product types from the application
const PRODUCT_TYPES = [
  'hang-tag',
  'woven-label',
  'care-label',
  'heat-transfer'
];

// Status values (excluding draft as per requirements)
const STATUSES = [
  'pending',
  'send to customer',
  'price confirmed',
  'sampling',
  'sample delivered'
];

// Sample company names for generating random customers
const COMPANY_NAMES = [
  'Fashion Co', 'Textile Ltd', 'Apparel Inc', 'Garment Group', 'Style Corp',
  'Clothing Co', 'Fabric Ltd', 'Design Inc', 'Trend Group', 'Wear Corp',
  'Thread Co', 'Stitch Ltd', 'Weave Inc', 'Pattern Group', 'Textile Corp',
  'Fashion House', 'Style Studio', 'Garment Factory', 'Apparel Works', 'Clothing Line'
];

// Sample first names
const FIRST_NAMES = [
  'John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa',
  'James', 'Mary', 'William', 'Jennifer', 'Richard', 'Linda', 'Thomas', 'Patricia',
  'Charles', 'Barbara', 'Daniel', 'Susan', 'Matthew', 'Jessica', 'Anthony', 'Karen',
  'Mark', 'Nancy', 'Donald', 'Betty', 'Steven', 'Helen'
];

// Sample last names
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker'
];

// Sample notes
const NOTES_TEMPLATES = [
  'Rush order - needed by end of month',
  'Standard delivery is fine',
  'Please use eco-friendly materials',
  'Sample approved, proceed with production',
  'Customer requested premium quality',
  'Repeat order from previous quotation',
  'New customer - first order',
  'Bulk order discount applied',
  'Special packaging required',
  'Express shipping requested',
  '',
  '',
  '' // Empty notes are common
];

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateEmail(firstName, lastName, company) {
  const domain = company.toLowerCase().replace(/\s+/g, '') + '.com';
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
}

function generatePhone() {
  return `+852-${randomInt(2000, 9999)}-${randomInt(1000, 9999)}`;
}

function generateProductDetails(productType) {
  const details = {};

  if (productType === 'hang-tag') {
    details.material = randomChoice(['Paper', 'Cardboard', 'Plastic', 'Fabric']);
    details.size = randomChoice(['5x8cm', '6x9cm', '7x10cm', '8x12cm']);
    details.printingMethod = randomChoice(['Offset', 'Digital', 'Screen', 'Letterpress']);
  }

  return details;
}

function calculatePrice(productType, quantity) {
  // Base prices per unit (in USD)
  const basePrices = {
    'hang-tag': 0.15,
    'woven-label': 0.25,
    'care-label': 0.20,
    'heat-transfer': 0.30
  };

  const basePrice = basePrices[productType] || 0.20;

  // Volume discounts
  let discount = 1.0;
  if (quantity >= 10000) discount = 0.7;
  else if (quantity >= 5000) discount = 0.8;
  else if (quantity >= 1000) discount = 0.9;

  const unitPrice = basePrice * discount;
  const total = unitPrice * quantity;

  return {
    unitPrice: parseFloat(unitPrice.toFixed(4)),
    total: parseFloat(total.toFixed(2))
  };
}

async function fetchCustomers() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/customers`);
    const result = await response.json();

    if (result.success && result.customers && result.customers.length > 0) {
      return result.customers;
    }
    return [];
  } catch (error) {
    console.log('Could not fetch existing customers, will generate new ones');
    return [];
  }
}

function generateCustomerData(existingCustomers) {
  // 70% chance to use existing customer if available
  if (existingCustomers.length > 0 && Math.random() < 0.7) {
    const customer = randomChoice(existingCustomers);
    const member = customer.members && customer.members.length > 0
      ? randomChoice(customer.members)
      : null;

    return {
      customerName: customer.companyName,
      contactPerson: member ? member.name : `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`,
      email: member ? `${member.emailPrefix}@${customer.emailDomain}` : generateEmail(randomChoice(FIRST_NAMES), randomChoice(LAST_NAMES), customer.companyName),
      phone: generatePhone()
    };
  }

  // Generate new customer data
  const firstName = randomChoice(FIRST_NAMES);
  const lastName = randomChoice(LAST_NAMES);
  const company = randomChoice(COMPANY_NAMES);

  return {
    customerName: company,
    contactPerson: `${firstName} ${lastName}`,
    email: generateEmail(firstName, lastName, company),
    phone: generatePhone()
  };
}

function generateQuotation(existingCustomers) {
  const customerData = generateCustomerData(existingCustomers);
  const productType = randomChoice(PRODUCT_TYPES);
  const quantity = randomChoice([500, 1000, 2000, 3000, 5000, 10000, 15000, 20000]);
  const pricing = calculatePrice(productType, quantity);
  const status = randomChoice(STATUSES);

  // Generate date within last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateCreated = randomDate(sixMonthsAgo, new Date());

  return {
    customerName: customerData.customerName,
    contactPerson: customerData.contactPerson,
    email: customerData.email,
    phone: customerData.phone,
    productType: productType,
    productDetails: generateProductDetails(productType),
    quantity: quantity,
    unitPrice: pricing.unitPrice,
    total: pricing.total,
    notes: randomChoice(NOTES_TEMPLATES),
    type: 'non email',
    sourceEmailUid: null,
    sourceEmailSubject: null,
    sourceEmailMessageId: null,
    profileImagePath: null,
    attachmentPaths: [],
    dateCreated: dateCreated.toISOString(),
    status: status
  };
}

async function createQuotation(quotation) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(quotation)
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, quotation: result.quotation };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting quotation generation...');
  console.log(`📊 Target: ${NUM_QUOTATIONS} quotations\n`);

  // Fetch existing customers
  console.log('📥 Fetching existing customers...');
  const existingCustomers = await fetchCustomers();
  console.log(`✅ Found ${existingCustomers.length} existing customers\n`);

  let successCount = 0;
  let failCount = 0;

  console.log('⏳ Generating quotations...\n');

  for (let i = 0; i < NUM_QUOTATIONS; i++) {
    const quotation = generateQuotation(existingCustomers);
    const result = await createQuotation(quotation);

    if (result.success) {
      successCount++;
      if ((i + 1) % 10 === 0) {
        console.log(`✅ Progress: ${i + 1}/${NUM_QUOTATIONS} (${successCount} successful, ${failCount} failed)`);
      }
    } else {
      failCount++;
      console.log(`❌ Failed to create quotation ${i + 1}: ${result.error}`);
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('\n' + '='.repeat(50));
  console.log('📈 Generation Complete!');
  console.log('='.repeat(50));
  console.log(`✅ Successfully created: ${successCount} quotations`);
  console.log(`❌ Failed: ${failCount} quotations`);
  console.log(`📊 Total: ${NUM_QUOTATIONS} quotations`);
  console.log('='.repeat(50));
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
