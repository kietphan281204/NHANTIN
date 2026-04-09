import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = join(__dirname, '..');

const PORT = Number(process.env.PORT || 8080);
const TO_EMAIL = process.env.TO_EMAIL || 'nhantinptk@gmail.com';
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const MAX_FILES = Number(process.env.MAX_FILES || 5);
const MAX_TOTAL_MB = Number(process.env.MAX_TOTAL_MB || 20);
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function jsonError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // allow non-browser or same-origin requests (no origin header)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    },
  }),
);

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Serve static files (HTML, CSS, JS) from parent directory
app.use(express.static(parentDir));

app.get('/health', (req, res) => res.json({ ok: true }));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    files: MAX_FILES,
    fileSize: MAX_TOTAL_BYTES, // per-file guard; we also enforce total below
  },
});

function requireSecret(req, res, next) {
  if (!UPLOAD_SECRET) return next(); // allow if not set (dev)
  const provided = req.get('x-upload-secret') || req.body?.upload_secret || '';
  if (provided !== UPLOAD_SECRET) return jsonError(res, 401, 'Unauthorized');
  return next();
}

function createTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

app.post('/api/send', upload.array('files', MAX_FILES), requireSecret, async (req, res) => {
  try {
    const subject = String(req.body?.subject || '📎 Tài liệu mới từ FileShare');
    const message = String(req.body?.message || '');
    const errorLog = String(req.body?.error_log || '');

    const files = Array.isArray(req.files) ? req.files : [];
    let totalBytes = 0;
    for (const f of files) totalBytes += f?.size || 0;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonError(res, 413, `Total attachments too large (max ${MAX_TOTAL_MB}MB)`);
    }

    const attachments = files.map((f) => ({
      filename: f.originalname || 'file',
      content: f.buffer,
      contentType: f.mimetype || 'application/octet-stream',
    }));

    const bodyParts = [];
    if (message) bodyParts.push(message);
    if (errorLog) bodyParts.push(`\n\n--- error_log ---\n${errorLog}`);

    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: TO_EMAIL,
      subject,
      text: bodyParts.join('\n\n') || '(no message)',
      attachments,
    });

    return res.json({ success: true });
  } catch (err) {
    return jsonError(res, 500, err?.message ? String(err.message) : 'Internal error');
  }
});

app.post('/api/notify-telegram', express.json(), async (req, res) => {
  try {
    const { message, sender, time } = req.body;
    if (!message) return jsonError(res, 400, 'Missing message');

    const subject = '📱 Tin nhắn mới từ Telegram';
    const body = `Bạn có tin nhắn mới từ Telegram:\n\nNgười gửi: ${sender || 'Ẩn danh'}\nThời gian: ${time || new Date().toLocaleString('vi-VN')}\n\nNội dung:\n${message}`;

    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: TO_EMAIL,
      subject,
      text: body,
    });

    return res.json({ success: true });
  } catch (err) {
    return jsonError(res, 500, err?.message ? String(err.message) : 'Internal error');
  }
});

// Telegram API proxy endpoints
app.get('/api/telegram/getUpdates', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=${limit}`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return jsonError(res, 500, err?.message || 'Internal error');
  }
});

app.post('/api/telegram/sendMessage', express.json(), async (req, res) => {
  try {
    const { text, parse_mode } = req.body;
    if (!text) return jsonError(res, 400, 'Missing text');

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: parse_mode || 'HTML'
      })
    });

    const data = await response.json();
    if (!data.ok) {
      return jsonError(res, 400, data.description || 'Telegram API error');
    }

    return res.json({ success: true, result: data.result });
  } catch (err) {
    return jsonError(res, 500, err?.message || 'Internal error');
  }
});

app.get('/api/telegram/getFile', async (req, res) => {
  try {
    const fileId = req.query.file_id;
    if (!fileId) return jsonError(res, 400, 'Missing file_id');

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (!data.ok) return jsonError(res, 400, data.description || 'Telegram API error');

    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    return res.json({ success: true, downloadUrl, result: data.result });
  } catch (err) {
    return jsonError(res, 500, err?.message || 'Internal error');
  }
});

app.post('/api/telegram/sendFile', upload.single('file'), async (req, res) => {
  try {
    const { caption } = req.body;
    const file = req.file;

    if (!file) return jsonError(res, 400, 'Missing file');

    const filename = file.originalname || 'file';
    const ext = filename.split('.').pop().toLowerCase();

    let method, field;
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      method = 'sendPhoto';
      field = 'photo';
    } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
      method = 'sendVideo';
      field = 'video';
    } else if (['mp3', 'm4a', 'wav', 'flac'].includes(ext)) {
      method = 'sendAudio';
      field = 'audio';
    } else {
      method = 'sendDocument';
      field = 'document';
    }

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    if (caption) formData.append('caption', caption);
    formData.append(field, new Blob([file.buffer], { type: file.mimetype }), filename);

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!data.ok) {
      return jsonError(res, 400, data.description || 'Telegram API error');
    }

    return res.json({ success: true, result: data.result });
  } catch (err) {
    return jsonError(res, 500, err?.message || 'Internal error');
  }
});

// Multer errors / payload issues
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return jsonError(res, 413, 'File too large');
  if (err?.code === 'LIMIT_FILE_COUNT') return jsonError(res, 413, 'Too many files');
  if (String(err?.message || '').startsWith('CORS:')) return jsonError(res, 403, err.message);
  return jsonError(res, 500, err?.message ? String(err.message) : 'Server error');
});

// Fallback: serve index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(join(parentDir, 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});

