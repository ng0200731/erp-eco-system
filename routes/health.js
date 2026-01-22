import express from 'express';

const router = express.Router();

/**
 * Create health routes
 * @param {Object} deps - Dependencies
 * @param {Object} deps.imapClient - IMAP client instance
 * @param {string} deps.SMTP_HOST - SMTP host
 * @param {number} deps.SMTP_PORT - SMTP port
 * @param {string} deps.MAIL_USER - Mail user
 * @param {string} deps.MAIL_PASS - Mail password
 * @param {string} deps.IMAP_HOST - IMAP host
 * @param {number} deps.IMAP_PORT - IMAP port
 * @param {string} deps.IMAP_TLS - IMAP TLS setting
 * @param {string} deps.SMTP_SECURE - SMTP secure setting
 */
export function createHealthRoutes(deps) {
  const { imapClient, SMTP_HOST, SMTP_PORT, MAIL_USER, MAIL_PASS, IMAP_HOST, IMAP_PORT, IMAP_TLS, SMTP_SECURE } = deps;

  // Health check endpoint with connection diagnostics
  router.get('/health', async (req, res) => {
    const health = {
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      connections: {
        imap: {
          connected: false,
          state: null,
          stateName: 'unknown'
        },
        smtp: {
          configured: true,
          host: SMTP_HOST,
          port: SMTP_PORT
        }
      }
    };

    // Check IMAP connection state
    if (imapClient) {
      health.connections.imap.connected = imapClient.state >= 2;
      health.connections.imap.state = imapClient.state;
      health.connections.imap.stateName =
        imapClient.state === 0 ? 'disconnected' :
        imapClient.state === 1 ? 'connecting' :
        imapClient.state === 2 ? 'authenticated' :
        imapClient.state === 3 ? 'selected' :
        imapClient.state === 4 ? 'idle' : 'unknown';
    }

    res.json(health);
  });

  // Email/IMAP/SMTP config endpoints (read + write env file)
  router.get('/config', (req, res) => {
    // NOTE: Values here reflect what the server started with.
    res.json({
      success: true,
      config: {
        MAIL_USER,
        MAIL_PASS,
        IMAP_HOST,
        IMAP_PORT,
        IMAP_TLS,
        SMTP_HOST,
        SMTP_PORT,
        SMTP_SECURE,
      },
    });
  });

  return router;
}
