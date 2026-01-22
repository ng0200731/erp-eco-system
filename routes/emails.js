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
 * @param {Function} deps.createImapClient - Create IMAP client function
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
    createImapClient,
    config
  } = deps;

  const { IMAP_HOST, IMAP_PORT, MAIL_USER, SMTP_HOST, SMTP_PORT, SMTP_SECURE } = config;

  // Get specific email by UID (supports both INBOX and sent folder via query parameter)
  router.get('/emails/:uid', async (req, res) => {
    try {
      // Get active profile for IMAP configuration
      const profiles = await getProfilesMemory();
      const activeProfile = profiles.find(p => p.isActive === 1);
      if (!activeProfile) {
        return res.status(400).json({
          success: false,
          error: 'No active email profile found. Please activate a profile in Settings.'
        });
      }

      // Use a fresh connection for each fetch to avoid state issues
      let fetchClient = null;

      try {
        const uid = Number(req.params.uid);
        if (!uid || isNaN(uid)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid email UID. Must be a number.'
          });
        }

        // Create a fresh IMAP client for this request using active profile
        fetchClient = createImapClient(activeProfile);

        await fetchClient.connect();

        // Determine which folder to open based on query parameter
        const folder = req.query.folder || 'inbox';
        let folderNames = [];
        let folderType = '';

        if (folder === 'sent') {
          folderNames = ['Sent', 'Sent Items', 'Sent Messages', '[Gmail]/Sent Mail', 'INBOX.Sent'];
          folderType = 'sent';
        } else {
          folderNames = ['INBOX'];
          folderType = 'inbox';
        }

        // Try to open the folder
        let mailbox;
        let openedFolder = null;
        for (const folderName of folderNames) {
          try {
            mailbox = await fetchClient.mailboxOpen(folderName);
            openedFolder = folderName;
            break;
          } catch (mailboxErr) {
            if (folderNames.length === 1) {
              // Only one folder to try (INBOX), so fail immediately
              console.error(`Failed to open ${folderName}:`, mailboxErr);
              return res.status(500).json({
                success: false,
                error: `Failed to open ${folderName}: ${mailboxErr.message}`,
                code: mailboxErr.code || 'UNKNOWN'
              });
            }
            // Multiple folders to try, continue to next one
            continue;
          }
        }

        if (!mailbox || !openedFolder) {
          return res.status(404).json({
            success: false,
            error: `Could not find ${folderType} folder. Tried: ${folderNames.join(', ')}`
          });
        }

        // Check if UID is in valid range
        if (mailbox.exists === 0) {
          return res.status(404).json({
            success: false,
            error: `${folderType} mailbox is empty`,
            uid: uid
          });
        }

        let bodyText = '';
        let found = false;

        try {
          // Double-check mailbox is still open before searching
          if (!fetchClient || fetchClient.state < 3) {
            console.error(`Mailbox check failed: client=${!!fetchClient}, state=${fetchClient?.state}`);
            throw new Error('Mailbox is not open. Cannot search.');
          }

          let seqNum = null;
          try {
            const searchStartTime = Date.now();
            const searchPromise = fetchClient.search({ uid: uid });
            const searchTimeout = new Promise((_, reject) => {
              setTimeout(() => {
                const elapsed = Date.now() - searchStartTime;
                console.error(`Search timeout after 5 seconds for UID ${uid} (elapsed: ${elapsed}ms, state: ${fetchClient?.state})`);
                reject(new Error('Search operation timed out after 5 seconds'));
              }, 5000);
            });

            const searchResult = await Promise.race([searchPromise, searchTimeout]);

            if (searchResult && searchResult.length > 0) {
              seqNum = searchResult[0];
            } else {
              return res.status(404).json({
                success: false,
                error: `Email with UID ${uid} not found in mailbox`,
                code: 'EMAIL_NOT_FOUND',
                uid: uid
              });
            }
          } catch (searchErr) {
            console.error('========== SEARCH ERROR ==========');
            console.error('UID:', uid);
            console.error('Error:', searchErr.message);
            console.error('Full error:', searchErr);
            console.error('==================================');

            return res.status(500).json({
              success: false,
              error: `Failed to search for email: ${searchErr.message}`,
              code: searchErr.code || 'SEARCH_FAILED',
              uid: uid,
              troubleshooting: searchErr.message.includes('timeout') ? [
                'IMAP server may be slow or unreachable',
                'Try clicking the email again after a few seconds',
                'Check server console for detailed timeout logs'
              ] : [
                'Email may have been deleted or moved',
                'Try refreshing the email list',
                'Check server console for detailed error logs'
              ]
            });
          }

          // Fetch by sequence number (not UID) with timeout
          const fetchOptions = {
            source: true,
            uid: true  // Include UID in response for verification
          };

          if (!seqNum) {
            return res.status(500).json({
              success: false,
              error: 'Sequence number not found',
              uid: uid
            });
          }

          // Ensure mailbox is still open before fetching
          if (!fetchClient || fetchClient.state < 3) {
            throw new Error('Mailbox is not open. Cannot fetch.');
          }

          const fetchStartTime = Date.now();

          const fetchPromise = (async () => {
            let messageReceived = false;
            for await (const msg of fetchClient.fetch(seqNum, fetchOptions)) {
              messageReceived = true;
              // Verify this is the correct message
              if (msg.uid === uid) {
                bodyText = msg.source ? msg.source.toString() : '';
                found = true;
                break;
              }
            }
            if (!messageReceived) {
              throw new Error('No message received from fetch operation');
            }
          })();

          // Add 10 second timeout to fetch operation
          const fetchTimeout = new Promise((_, reject) => {
            setTimeout(() => {
              const elapsed = Date.now() - fetchStartTime;
              console.error(`Fetch timeout after 10 seconds for UID ${uid}, seqNum ${seqNum} (elapsed: ${elapsed}ms)`);
              reject(new Error('Fetch operation timed out after 10 seconds'));
            }, 10000);
          });

          await Promise.race([fetchPromise, fetchTimeout]);
        } catch (fetchErr) {
          console.error('========== FETCH EMAIL ERROR ==========');
          console.error('UID:', uid);
          console.error('Error message:', fetchErr.message);
          console.error('Error code:', fetchErr.code);
          console.error('Full error object:', fetchErr);
          console.error('=======================================');

          let errorMsg = fetchErr.message || 'Failed to fetch email';
          let errorCode = fetchErr.code || fetchErr.responseCode || 'UNKNOWN';

          if (fetchErr.responseCode === 'NO') {
            errorMsg = `Email not found or cannot be accessed. UID: ${uid}`;
          } else if (fetchErr.responseCode === 'BAD') {
            errorMsg = `Invalid command or server error. UID: ${uid}`;
          } else if (fetchErr.message?.includes('not found') || fetchErr.message?.includes('does not exist')) {
            errorMsg = `Email with UID ${uid} does not exist in the mailbox`;
            errorCode = 'EMAIL_NOT_FOUND';
          } else if (fetchErr.message?.includes('Command failed')) {
            errorMsg = `IMAP command failed. The email may have been deleted or moved. UID: ${uid}`;
            if (fetchErr.responseText) {
              errorMsg += `\nServer response: ${fetchErr.responseText}`;
            }
          }

          const troubleshooting = [];
          if (errorCode === 'EMAIL_NOT_FOUND') {
            troubleshooting.push('Email may have been deleted or moved');
            troubleshooting.push('Try refreshing the email list');
          } else if (fetchErr.message?.includes('timeout')) {
            troubleshooting.push('IMAP server took too long to respond');
            troubleshooting.push('Try clicking the email again');
            troubleshooting.push('Check server console for connection issues');
          } else {
            troubleshooting.push('Check server console logs for detailed error');
            troubleshooting.push('Try refreshing the email list');
            troubleshooting.push('If persists, restart server with start.bat');
          }

          return res.status(500).json({
            success: false,
            error: errorMsg,
            code: errorCode,
            uid: uid,
            responseCode: fetchErr.responseCode,
            responseText: fetchErr.responseText,
            command: fetchErr.command,
            troubleshooting: troubleshooting
          });
        }

        if (!found) {
          return res.status(404).json({
            success: false,
            error: `Email with UID ${uid} not found`
          });
        }

        res.json({ success: true, uid, source: bodyText });
      } catch (err) {
        console.error('========== FETCH EMAIL ERROR ==========');
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
        console.error('Full error:', err);
        console.error('=======================================');

        res.status(500).json({
          success: false,
          error: err.message || 'Failed to fetch email',
          code: err.code || 'UNKNOWN'
        });
      } finally {
        // ALWAYS close and cleanup the fresh connection we created for this request
        if (fetchClient) {
          try {
            if (fetchClient.state >= 3) {
              await fetchClient.mailboxClose();
            }
            if (fetchClient.state >= 2) {
              await fetchClient.logout();
            }
          } catch (closeErr) {
            console.warn('Error closing fresh IMAP client:', closeErr.message);
          }
        }
      }
    } catch (err) {
      console.error('Error in email detail route:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch email',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Get emails from IMAP inbox
  router.get('/emails', async (req, res) => {
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

      if (!imapClient || imapClient.state < 2) {
        return res.status(500).json({
          success: false,
          error: 'IMAP client not connected'
        });
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const lock = await imapClient.getMailboxLock('INBOX');
      try {
        const totalMessages = imapClient.mailbox.exists;

        if (totalMessages === 0) {
          return res.json({
            success: true,
            emails: [],
            pagination: {
              limit,
              offset,
              total: 0,
              hasMore: false
            }
          });
        }

        const startSeq = Math.max(1, totalMessages - offset - limit + 1);
        const endSeq = Math.max(1, totalMessages - offset);

        if (startSeq > endSeq) {
          return res.json({
            success: true,
            emails: [],
            pagination: {
              limit,
              offset,
              total: totalMessages,
              hasMore: false
            }
          });
        }

        const messages = [];
        for await (const msg of imapClient.fetch(`${startSeq}:${endSeq}`, {
          envelope: true,
          bodyStructure: true,
          uid: true,
          flags: true,
        })) {
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            flags: msg.flags,
            envelope: msg.envelope,
            bodyStructure: msg.bodyStructure,
          });
        }

        messages.reverse();

        res.json({
          success: true,
          emails: messages,
          pagination: {
            limit,
            offset,
            total: totalMessages,
            hasMore: offset + limit < totalMessages
          }
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('Error fetching emails:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch emails',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Get sent emails from IMAP sent folder
  router.get('/sent-emails/imap', async (req, res) => {
    try {
      const profiles = await getProfilesMemory();
      const activeProfile = profiles.find(p => p.isActive === 1);
      if (!activeProfile) {
        return res.status(400).json({
          success: false,
          error: 'No active email profile found. Please activate a profile in Settings.'
        });
      }

      // Create fresh IMAP client
      const imapClient = createImapClient(activeProfile);

      try {
        await imapClient.connect();

        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Math.max(Number(req.query.offset) || 0, 0);

        // Try common sent folder names
        const sentFolderNames = ['Sent', 'Sent Items', 'Sent Messages', '[Gmail]/Sent Mail', 'INBOX.Sent'];
        let mailbox = null;
        let sentFolderName = null;

        for (const folderName of sentFolderNames) {
          try {
            mailbox = await imapClient.mailboxOpen(folderName);
            sentFolderName = folderName;
            break;
          } catch (err) {
            // Try next folder name
            continue;
          }
        }

        if (!mailbox) {
          return res.status(404).json({
            success: false,
            error: 'Could not find sent folder. Tried: ' + sentFolderNames.join(', ')
          });
        }

        const totalMessages = mailbox.exists;

        if (totalMessages === 0) {
          return res.json({
            success: true,
            sentEmails: [],
            pagination: {
              limit,
              offset,
              total: 0,
              hasMore: false
            }
          });
        }

        const startSeq = Math.max(1, totalMessages - offset - limit + 1);
        const endSeq = Math.max(1, totalMessages - offset);

        if (startSeq > endSeq) {
          return res.json({
            success: true,
            sentEmails: [],
            pagination: {
              limit,
              offset,
              total: totalMessages,
              hasMore: false
            }
          });
        }

        const messages = [];
        for await (const msg of imapClient.fetch(`${startSeq}:${endSeq}`, {
          envelope: true,
          bodyStructure: true,
          uid: true,
          flags: true,
        })) {
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            flags: msg.flags,
            envelope: msg.envelope,
            bodyStructure: msg.bodyStructure,
            sentFolder: sentFolderName
          });
        }

        messages.reverse();

        await imapClient.logout();

        res.json({
          success: true,
          sentEmails: messages,
          pagination: {
            limit,
            offset,
            total: totalMessages,
            hasMore: offset + limit < totalMessages
          }
        });
      } catch (err) {
        if (imapClient) {
          try {
            await imapClient.logout();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        throw err;
      }
    } catch (err) {
      console.error('Error fetching IMAP sent emails:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch sent emails from IMAP',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Get sent emails with pagination (from database)
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

  // Send email via SMTP
  router.post('/email/send', async (req, res) => {
    try {
      // Get active profile for SMTP configuration
      const profiles = await getProfilesMemory();
      const activeProfile = profiles.find(p => p.isActive === 1);
      if (!activeProfile) {
        return res.status(400).json({
          success: false,
          error: 'No active email profile found. Please activate a profile in Settings.'
        });
      }

      const { to, subject, text, html } = req.body || {};
      if (!to || !subject || (!text && !html)) {
        return res.status(400).json({ success: false, error: 'to, subject, and text|html are required' });
      }

      let transport = null;
      const maxRetries = 2; // Try up to 2 times (initial + 1 retry)
      let lastError = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Clean up previous transport if retrying
          if (transport) {
            try {
              transport.close();
            } catch (e) {
              // Ignore cleanup errors
            }
          }

          // Create fresh transport for this attempt using active profile
          transport = createSmtpTransport(activeProfile);

          // Try to send with increased timeout (no timeout limit - let it try)
          const sendPromise = transport.sendMail({
            from: `"ERP System" <${activeProfile.mailUser}>`,
            to,
            subject,
            text: text || html?.replace(/<[^>]*>/g, ''), // Strip HTML if only html provided
            html: html || text?.replace(/\n/g, '<br>') // Convert newlines to <br> if only text provided
          });

          // Add 60 second timeout (increased from default)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('SMTP send operation timed out after 60 seconds')), 60000);
          });

          const info = await Promise.race([sendPromise, timeoutPromise]);

          // Store the sent email in the database
          console.log('Storing sent email in database:', { to, subject, messageId: info.messageId });
          try {
            const storedEmail = await createSentEmail({
              to_email: to,
              subject: subject,
              body_text: text || html?.replace(/<[^>]*>/g, ''),
              body_html: html || text?.replace(/\n/g, '<br>'),
              message_id: info.messageId,
              smtp_response: info.response,
              status: 'sent',
              sender_email: activeProfile.mailUser
            });
            console.log('Successfully stored sent email:', storedEmail.id);
          } catch (dbErr) {
            console.error('Failed to store sent email in database:', dbErr);
            // Don't fail the request if DB storage fails
          }

          // Append sent email to IMAP sent folder
          console.log('Appending sent email to IMAP sent folder...');
          try {
            const imapClient = createImapClient(activeProfile);
            await imapClient.connect();

            // Try common sent folder names
            const sentFolderNames = ['Sent', 'Sent Items', 'Sent Messages', '[Gmail]/Sent Mail', 'INBOX.Sent'];
            let sentFolderName = null;

            for (const folderName of sentFolderNames) {
              try {
                await imapClient.mailboxOpen(folderName);
                sentFolderName = folderName;
                break;
              } catch (err) {
                continue;
              }
            }

            if (sentFolderName) {
              // Build RFC822 email message
              const emailMessage = [
                `From: ${activeProfile.mailUser}`,
                `To: ${to}`,
                `Subject: ${subject}`,
                `Date: ${new Date().toUTCString()}`,
                `Message-ID: ${info.messageId}`,
                `Content-Type: text/plain; charset=utf-8`,
                ``,
                text || html?.replace(/<[^>]*>/g, '')
              ].join('\r\n');

              // Append to sent folder
              await imapClient.append(sentFolderName, emailMessage, ['\\Seen']);
              console.log('Successfully appended email to IMAP sent folder:', sentFolderName);
            } else {
              console.warn('Could not find IMAP sent folder to append email');
            }

            await imapClient.logout();
          } catch (imapErr) {
            console.error('Failed to append email to IMAP sent folder:', imapErr);
            // Don't fail the request if IMAP append fails
          }

          // Close transport after sending
          transport.close();

          return res.json({ success: true, messageId: info.messageId, response: info.response });

        } catch (err) {
          lastError = err;
          console.error(`========== SEND EMAIL ERROR (Attempt ${attempt}/${maxRetries}) ==========`);
          console.error('Error message:', err.message);
          console.error('Error code:', err.code);
          console.error('Error response:', err.response);
          console.error('Error responseCode:', err.responseCode);
          console.error('Full error:', err);
          console.error('======================================');

          // Clean up transport on error
          if (transport) {
            try {
              transport.close();
            } catch (e) {
              // Ignore cleanup errors
            }
            transport = null;
          }

          // If it's a connection/timeout error and we have retries left, retry
          const isRetryableError =
            err.code === 'ECONNECTION' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ESOCKET' ||
            err.message?.includes('timeout') ||
            err.message?.includes('Failed to fetch') ||
            err.message?.includes('Network error');

          if (isRetryableError && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue; // Retry
          } else {
            // Not retryable or no retries left, break and return error
            break;
          }
        }
      }

      // All retries exhausted or non-retryable error
      // Store the failed email attempt in the database
      try {
        await createSentEmail({
          to_email: to,
          subject: subject,
          body_text: text || html?.replace(/<[^>]*>/g, ''),
          body_html: html || text?.replace(/\n/g, '<br>'),
          message_id: null,
          smtp_response: null,
          status: 'failed',
          error_message: lastError.message,
          sender_email: activeProfile.mailUser
        });
      } catch (dbErr) {
        console.error('Failed to store failed email in database:', dbErr);
        // Don't fail the request if DB storage fails
      }

      let errorMsg = lastError.message || 'Failed to send email';
      if (lastError.code === 'EAUTH') {
        errorMsg = 'SMTP authentication failed. Check your email and password.';
      } else if (lastError.code === 'ECONNECTION') {
        errorMsg = `Cannot connect to SMTP server ${SMTP_HOST}:${SMTP_PORT}. Check network/firewall. Connection may have timed out after idle period.`;
      } else if (lastError.code === 'ETIMEDOUT' || lastError.message?.includes('timeout')) {
        errorMsg = 'SMTP connection timeout. Server may be down or unreachable. This may happen after idle period.';
      } else if (lastError.message?.includes('Failed to fetch') || lastError.message?.includes('Network error')) {
        errorMsg = 'Network error - connection lost. This may happen after idle period. Please try again.';
      }

      const troubleshooting = [];
      if (lastError.code === 'EAUTH') {
        troubleshooting.push('Check MAIL_USER and MAIL_PASS in env file');
        troubleshooting.push('Verify email account credentials are correct');
      } else if (lastError.code === 'ECONNECTION' || lastError.code === 'ETIMEDOUT' || lastError.code === 'ESOCKET') {
        troubleshooting.push('Check network connectivity to ' + SMTP_HOST + ':' + SMTP_PORT);
        troubleshooting.push('Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE in env file');
        troubleshooting.push('Check Windows Firewall settings');
        troubleshooting.push('Try restarting server with start.bat');
      } else {
        troubleshooting.push('Check server console logs for detailed error');
        troubleshooting.push('Try sending again after a few seconds');
      }

      const errorResponse = {
        success: false,
        error: errorMsg,
        code: lastError.code || 'UNKNOWN',
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: SMTP_SECURE === 'true',
        originalError: lastError.message,
        retriesAttempted: maxRetries,
        troubleshooting: troubleshooting
      };

      res.status(500).json(errorResponse);
    } catch (err) {
      console.error('Error in email send route:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to send email',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Test SMTP connection endpoint
  router.get('/smtp/test', async (req, res) => {
    try {
      // Get active profile for SMTP configuration
      const profiles = await getProfilesMemory();
      const activeProfile = profiles.find(p => p.isActive === 1);
      if (!activeProfile) {
        return res.status(400).json({
          success: false,
          error: 'No active email profile found. Please activate a profile in Settings.'
        });
      }

      // Use active profile settings
      const smtpHost = activeProfile.smtpHost;
      const smtpPort = Number(activeProfile.smtpPort);
      const smtpSecure = activeProfile.smtpSecure === 'true';

      // Create fresh transport using active profile
      const transport = createSmtpTransport(activeProfile);

      // Verify connection
      await transport.verify();

      // Close transport after verification
      transport.close();

      res.json({
        success: true,
        message: 'SMTP connection successful',
        config: {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: activeProfile.mailUser
        }
      });
    } catch (err) {
      console.error('SMTP test error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'SMTP connection failed',
        code: err.code || 'UNKNOWN'
      });
    }
  });

  // Export helper function for use in other routes
  router.getProfilesMemory = getProfilesMemory;

  return router;
}
