/**
 * Eurokids Staff Portal — Leave application backup
 *
 * Attach this script to a Google Sheet.
 * Every leave application (from any source) gets a new row appended.
 * The sheet is a permanent off-portal record — even if Supabase blows away,
 * the whole academic year's leaves live on here.
 *
 * SETUP STEPS (once, in the Sheet):
 *   1) Create a fresh Google Sheet named e.g. "Eurokids Leave Log 2026-27".
 *   2) Extensions → Apps Script.
 *   3) Delete the default myFunction stub; paste THIS ENTIRE FILE in.
 *   4) Click Deploy → New deployment.
 *      Type: Web app.
 *      Execute as: Me.
 *      Who has access: Anyone.
 *      Deploy.
 *   5) Copy the resulting URL — looks like
 *      https://script.google.com/macros/s/AKfycb…/exec
 *   6) In Vercel → Settings → Environment Variables, add:
 *        Key   = GOOGLE_SHEET_WEBHOOK_URL
 *        Value = the URL from step 5
 *      Tick Production + Preview. Save.
 *   7) Redeploy the Vercel project (Deployments → ⋯ → Redeploy).
 *
 * After that, every leave submitted through any channel appears in this sheet
 * within about a second.
 */

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaves')
              || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Leaves');

  // If the sheet is empty, seed the header row
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Received At (server)',
      'Applied At (portal)',
      'Employee ID',
      'Employee Name',
      'Department',
      'Designation',
      'Leave Type',
      'Start Date',
      'End Date',
      'Days',
      'Reason',
      'Status',
      'Source',
      'Personal Email',
    ]);
    // Bold + freeze the header
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#F3F4F6');
    sheet.setFrozenRows(1);
  }

  const body = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date(),
    body.applied_at || '',
    body.employee_id || '',
    body.employee_name || '',
    body.department || '',
    body.designation || '',
    body.leave_type || '',
    body.start_date || '',
    body.end_date || '',
    body.total_days || '',
    body.reason || '',
    body.status || '',
    body.source || '',
    body.personal_email || '',
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
