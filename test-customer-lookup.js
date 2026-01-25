import { findCustomerByEmail } from './db/tasksDb.js';

const testEmail = '859543169@qq.com';

console.log('Testing customer lookup for:', testEmail);
console.log('Email domain:', testEmail.split('@')[1]);
console.log('Email prefix:', testEmail.split('@')[0]);
console.log('---');

try {
  const result = await findCustomerByEmail(testEmail);

  if (result) {
    console.log('✅ Customer found!');
    console.log('\nCustomer:', JSON.stringify(result.customer, null, 2));
    console.log('\nMember:', JSON.stringify(result.member, null, 2));
    console.log('\nAll Members:', JSON.stringify(result.allMembers, null, 2));
  } else {
    console.log('❌ No customer found for this email');
    console.log('\nThis means either:');
    console.log('1. No customer exists with emailDomain = "qq.com"');
    console.log('2. Customer exists but no member with emailPrefix = "859543169"');
  }
} catch (err) {
  console.error('❌ Error during lookup:', err);
}

process.exit(0);
