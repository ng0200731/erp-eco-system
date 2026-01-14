## PRD — Longriver Email + Task Ecosystem (Email-driven ERP Workbench)

### 1) Email profile / settings (foundation)
The current “Email Client” screen is the **email profile and connectivity layer**:
- Must reliably **fetch incoming email** via Longriver IMAP.
- Must reliably **send outgoing email** via Longriver SMTP.

This is the base system that everything else depends on.

### 2) Product vision (ecosystem)
Use incoming customer emails as “requests” that create internal tasks.

Over time, we will add many task types into this ecosystem. Examples:
- **Image Library**: query internal image DB by tags, then reply with selected images/links.
- **Quotation**: ask for missing product attributes; when complete, generate/send quotation.
- **ERP Enquiry**: use customer’s seq#/order# to query ERP via API and reply with status.
- **More**: additional task modules can be added later.

### 3) Reply workflow
When a task is completed, the system should **reply to the customer on top of the original email request** (reply/quote/threading behavior).

### 4) Task lifecycle (tracking)
Each task has a unique sequence (task id) and a lifecycle:
- **Email received** → **Internal processing** → **Send outgoing reply** → **Follow up** → **Case close** (open/closed)
- Must support supervision: view status and open items.

### Users
- **Operators**: handle customer email requests and complete tasks.
- **Supervisors**: track all tasks, follow-ups, and closures via dashboard.
- **Admin/support**: maintain IMAP/SMTP profile + troubleshoot connectivity.

### Goals (success looks like)
- **Email foundation works**:
  - IMAP/SMTP stable; no server crashes; refresh always loads.
- **Task system works**:
  - Incoming email can be turned into a task with unique id.
  - Tasks move through states; history is visible.
  - Outgoing replies are linked to the original request (threading).
- **Dashboard**:
  - Shows open tasks, status, owner, last update, and due/follow-up.
- **UX constraints**:
  - Strict black/white only; straight borders only.
  - No browser popups; centered in-app modal only.

### Non-goals (explicitly not doing now)
- No full multi-tenant auth system unless requested.
- No full mailbox management beyond what is required for task creation/reply.
- No major framework rewrite unless requested.

### Acceptance criteria (MVP for next phase)
- Can create a Task from a selected email (manual button is OK for MVP).
- Task has: id, type, status, linked email uid/message-id, customer email, subject, timestamps.
- Dashboard lists tasks; can open a task detail page.
- Can send a reply from a task detail view that references the original email.
  - (MVP can include the original subject and basic quoted context.)


