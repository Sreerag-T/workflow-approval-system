const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { HttpError } = require('../utils/errors');

const dir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(dir, { recursive: true });

const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.txt'];

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new HttpError(422, `File type not allowed. Allowed: ${ALLOWED.join(', ')}`)),
});

module.exports = { upload, uploadDir: dir };
