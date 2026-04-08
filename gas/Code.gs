const TO_EMAIL = "kietphan28122004@gmail.com";
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // keep under Gmail/Apps Script practical limits

// Telegram bot configuration - replace with your actual bot token and chat ID
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"; // e.g., "123456:ABCDEF..."
const TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID"; // e.g., "-1001234567890"

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

    // Send the message to Telegram
    try {
      var telegramText = "📧 New message from FileShare:\nSubject: " + subject + "\n" + (message || "(no message)");
      sendTelegramMessage(telegramText);
    } catch (tgErr) {
      // Log but do not fail the main flow
      console.error('Telegram notification failed: ' + tgErr);
    }

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

/**
 * Sends a text message to a Telegram chat using the Bot API.
 * @param {string} text The message text to send.
 */
function sendTelegramMessage(text) {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  var payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: "HTML"
  };
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  // Optionally log response for debugging
  // Logger.log('Telegram response: ' + response.getContentText());
}
