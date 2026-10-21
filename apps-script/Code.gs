function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var timestamp = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow([
    timestamp,
    data.event,
    data.name,
    data.adults,
    data.kids,
    data.contact
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
