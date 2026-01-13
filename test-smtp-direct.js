// Direct SMTP test script
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'env') });

const {
  MAIL_USER,
  MAIL_PASS,
  SMTP_HOST = 'homegw.bbmail.com.hk',
  SMTP_PORT = 465,
  SMTP_SECURE = 'true',
} = process.env;

console.log('=== SMTP Direct Test ===');
console.log(`Host: ${SMTP_HOST}`);
console.log(`Port: ${SMTP_PORT}`);
console.log(`Secure: ${SMTP_SECURE === 'true'}`);
console.log(`User: ${MAIL_USER}`);
console.log('');

const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true',
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS?.replace(/^["']|["']$/g, ''),
  },
  tls: {
    rejectUnauthorized: false,
    servername: SMTP_HOST,
  },
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000,
  debug: true,
  logger: true,
});

console.log('Testing SMTP connection...');
console.log('');

try {
  await transport.verify();
  console.log('✅ SMTP connection successful!');
  
  console.log('\nSending test email...');
  const info = await transport.sendMail({
    from: `"Test" <${MAIL_USER}>`,
    to: 'eric.brilliant@gmail.com',
    subject: 'Test Email from Direct SMTP Test',
    text: 'This is a test email sent directly via SMTP.',
  });
  
  console.log('✅ Email sent successfully!');
  console.log('Message ID:', info.messageId);
  console.log('Response:', info.response);
} catch (err) {
  console.error('❌ Error:', err.message);
  console.error('Code:', err.code);
  console.error('Full error:', err);
  process.exit(1);
}

