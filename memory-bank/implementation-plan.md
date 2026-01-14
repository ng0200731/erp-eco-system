## Implementation plan (incremental, testable)

### Phase A — Email foundation hardening (DONE)
Includes:
- Monochrome + modal-only UX
- Straight borders only
- Idle recovery for reading email
- Backend resilience + better diagnostics

### Phase B — Task ecosystem MVP (NEXT)

#### Step B1 — Define task model + storage (MVP)
- **Do**:
  - Add a simple persistent storage for tasks (choose one):
    - Option 1: JSON file storage (`data/tasks.json`) for fastest MVP
    - Option 2: SQLite for better reliability (still simple)
  - Define Task fields:
    - `id` (unique seq)
    - `type` (image-library / quotation / erp-enquiry / ...)
    - `status` (new / in_progress / waiting_customer / replied / follow_up / closed)
    - `sourceEmailUid`
    - `sourceSubject`, `customerEmail`
    - timestamps: `createdAt`, `updatedAt`
- **Verify**:
  - Restart server, create a task via API, reload, task still exists.

#### Step B2 — “Create task from email” (manual MVP)
- **Do**:
  - From email detail page, add a button: “Create Task”
  - Calls backend to create a task linked to that email
- **Verify**:
  - Select an email → click create task → task appears in dashboard list.

#### Step B3 — Dashboard (tasks list + task detail)
- **Do**:
  - Add dashboard view:
    - list open tasks (filter by status)
    - open task detail: show lifecycle + notes
    - allow status transitions (dropdown)
- **Verify**:
  - Tasks can be viewed/updated; page refresh preserves state.

#### Step B4 — Reply on top of original request (MVP threading)
- **Do**:
  - On task detail, add “Reply customer”:
    - Pre-fill subject with `Re: <original subject>`
    - Include quoted context (MVP: body excerpt)
    - Send via existing SMTP endpoint
  - Store reply metadata on the task (sentAt, messageId)
- **Verify**:
  - Clicking “Reply customer” sends email and task status becomes `replied`.

#### Step B5 — Add first task type: ERP enquiry (MVP stub)
- **Do**:
  - Add UI fields for seq#/order#
  - Implement backend placeholder integration (stub response) until ERP API details provided
- **Verify**:
  - User can enter order#, system produces a reply draft.


