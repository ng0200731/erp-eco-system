// Raw SMTP connection test
import net from 'net';
import tls from 'tls';

const host = 'homegw.bbmail.com.hk';
const port = 465;

console.log(`Testing raw connection to ${host}:${port}...`);

// Test 1: Raw TCP connection
console.log('\n[Test 1] Raw TCP connection...');
const tcpSocket = net.createConnection(port, host, () => {
  console.log('✅ TCP connection successful!');
  tcpSocket.end();
  
  // Test 2: SSL/TLS connection
  console.log('\n[Test 2] SSL/TLS connection...');
  const tlsSocket = tls.connect({
    host: host,
    port: port,
    rejectUnauthorized: false,
  }, () => {
    console.log('✅ SSL/TLS connection successful!');
    console.log('TLS Version:', tlsSocket.getProtocol());
    console.log('Cipher:', tlsSocket.getCipher());
    tlsSocket.end();
  });
  
  tlsSocket.on('error', (err) => {
    console.error('❌ SSL/TLS error:', err.message);
  });
  
  tlsSocket.setTimeout(10000, () => {
    console.error('❌ SSL/TLS connection timeout');
    tlsSocket.destroy();
  });
});

tcpSocket.on('error', (err) => {
  console.error('❌ TCP connection error:', err.message);
});

tcpSocket.setTimeout(10000, () => {
  console.error('❌ TCP connection timeout');
  tcpSocket.destroy();
});

