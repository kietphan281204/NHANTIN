import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';

const PORT = Number(process.env.PORT || 8080);
const TO_EMAIL = process.env.TO_EMAIL || 'kietphan28122004@gmail.com';
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const MAX_FILES = Number(process.env.MAX_FILES || 5);
const MAX_TOTAL_MB = Number(process.env.MAX_TOTAL_MB || 20);
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;

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

// Multer errors / payload issues
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return jsonError(res, 413, 'File too large');
  if (err?.code === 'LIMIT_FILE_COUNT') return jsonError(res, 413, 'Too many files');
  if (String(err?.message || '').startsWith('CORS:')) return jsonError(res, 403, err.message);
  return jsonError(res, 500, err?.message ? String(err.message) : 'Server error');
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});

