import express from 'express';

const router = express.Router();

/**
 * Create email routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.listSentEmails - List sent emails function
 * @param {Function} deps.getSentEmailsCount - Get sent emails count function
 * @param {Function} deps.getSentEmailById - Get sent email by ID function
 * @param {Function} deps.createSentEmail - Create sent email function
 * @param {Function} deps.getProfilesMemory - Get profiles from memory function
 * @param {Function} deps.connectImap - Connect to IMAP function
 * @param {Function} deps.getImapClient - Get IMAP client function
 * @param {Function} deps.setImapClient - Set IMAP client function
 * @param {Function} deps.getSmtpTransport - Get SMTP transport function
 * @param {Function} deps.createSmtpTransport - Create SMTP transport function
 * @param {Object} deps.config - Configuration object (IMAP_HOST, IMAP_PORT, MAIL_USER, SMTP_HOST, SMTP_PORT, SMTP_SECURE)
 */
export function createEmailRoutes(deps) {
  const {
    listSentEmails,
    getSentEmailsCount,
    getSentEmailById,
    createSentEmail,
    getProfilesMemory,
    connectImap,
    getImapClient,
    setImapClient,
    getSmtpTransport,
    createSmtpTransport,
    config
  } = deps;

  const { IMAP_HOST, IMAP_PORT, MAIL_USER, SMTP_HOST, SMTP_PORT, SMTP_SECURE } = config;

  // Get sent emails with pagination
  router.get('/sent-emails', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const sender_email = req.query.sender_email;

      const sentEmails = await listSentEmails({ limit, offset, sender_email });
      const totalCount = await getSentEmailsCount({ sender_email });

      res.json({
        success: true,
        sentEmails,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount
        }
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to list sent emails',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Get sent email by ID
  router.get('/sent-emails/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid sent email id' });
      }
      const sentEmail = await getSentEmailById(id);
      if (!sentEmail) {
        return res.status(404).json({ success: false, error: 'Sent email not found' });
      }
      res.json({ success: true, sentEmail });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to get sent email',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Test IMAP connection
  router.get('/test-connection', async (req, res) => {
    try {
      const profiles = await getProfilesMemory();
      const activeProfile = profiles.find(p => p.isActive === 1);
      if (!activeProfile) {
        return res.status(400).json({
          success: false,
          error: 'No active email profile found. Please activate a profile in Settings.'
        });
      }

      await connectImap();
      const imapClient = getImapClient();
      if (imapClient && imapClient.connected) {
        res.json({ success: true, message: 'IMAP connection successful' });
      } else {
        res.status(500).json({ success: false, error: 'IMAP client exists but not connected' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message, details: err.toString() });
    }
  });

  // IMAP diagnostic endpoint
  router.get('/imap/diagnostic', async (req, res) => {
    try {
      const imapClient = getImapClient();
      const diagnostics = {
        imapClientExists: !!imapClient,
        imapClientState: imapClient?.state || null,
        imapClientStateName: imapClient?.state === 0 ? 'disconnected' :
          imapClient?.state === 1 ? 'connecting' :
          imapClient?.state === 2 ? 'authenticated' :
          imapClient?.state === 3 ? 'selected' :
          imapClient?.state === 4 ? 'idle' : 'unknown',
        imapHost: IMAP_HOST,
        imapPort: IMAP_PORT,
        mailUser: MAIL_USER ? `${MAIL_USER.substring(0, 3)}***` : 'not set'
      };

      // Try to connect
      try {
        await connectImap();
        const updatedClient = getImapClient();
        diagnostics.connectionTest = 'success';
        diagnostics.imapClientStateAfterConnect = updatedClient?.state || null;

        // Try to open mailbox
        if (updatedClient && updatedClient.state >= 2) {
          try {
            const mailbox = await updatedClient.mailboxOpen('INBOX', { readOnly: true });
            diagnostics.mailboxTest = 'success';
            diagnostics.mailboxExists = mailbox.exists;
          } catch (mailboxErr) {
            diagnostics.mailboxTest = 'failed';
            diagnostics.mailboxError = mailboxErr.message;
          }
        }
      } catch (connectErr) {
        diagnostics.connectionTest = 'failed';
        diagnostics.connectionError = connectErr.message;
      }

      res.json({ success: true, diagnostics });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Export helper function for use in other routes
  router.getProfilesMemory = getProfilesMemory;

  return router;
}
