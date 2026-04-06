const TO_EMAIL = "kietphan28122004@gmail.com";
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // keep under Gmail/Apps Script practical limits

function doGet() {
  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ success: false, message: "Missing request body" }, 400);
    }

    var payload = JSON.parse(e.postData.contents);
    var subject = String(payload.subject || "📎 Tài liệu mới từ FileShare");
    var message = String(payload.message || "");
    var errorLog = String(payload.error_log || "");
    var files = Array.isArray(payload.files) ? payload.files : [];

    var total = 0;
    var attachments = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var name = String(f.name || ("file_" + (i + 1)));
      var mime = String(f.type || "application/octet-stream");
      var b64 = String(f.base64 || "");

      // allow either raw base64 or dataURL
      var comma = b64.indexOf(",");
      if (comma !== -1 && b64.slice(0, comma).indexOf("base64") !== -1) {
        b64 = b64.slice(comma + 1);
      }

      var bytes = Utilities.base64Decode(b64);
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) {
        return json_({ success: false, message: "Total attachments too large" }, 413);
      }
      attachments.push(Utilities.newBlob(bytes, mime, name));
    }

    var bodyParts = [];
    if (message) bodyParts.push(message);
    if (errorLog) bodyParts.push("\n\n--- error_log ---\n" + errorLog);
    var body = bodyParts.join("\n\n");

    MailApp.sendEmail({
      to: TO_EMAIL,
      subject: subject,
      body: body || "(no message)",
      attachments: attachments
    });

    return json_({ success: true }, 200);
  } catch (err) {
    return json_({ success: false, message: String(err && err.message ? err.message : err) }, 500);
  }
}

function json_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script doesn't reliably support setting HTTP status in Web Apps.
  return out;
}

