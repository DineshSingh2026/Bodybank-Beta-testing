const multer = require('multer');
const db = require('./db');

const MAX_BYTES = 8 * 1024 * 1024;

// The browser sends the MIME type, so it cannot be trusted on its own. Each
// accepted format is confirmed from the leading bytes of the file itself.
const SIGNATURES = [
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? match.mime : null;
}

// Screenshots are held in memory just long enough to be written to Postgres.
// Nothing is stored on disk, because Render rebuilds the filesystem on deploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 30 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error('Screenshots must be a PNG, JPG, GIF, or WebP image.'));
  },
});

/**
 * Stores an uploaded screenshot and returns the URL to reach it,
 * or null when the request carried no file.
 */
async function saveFile(file) {
  if (!file || !file.buffer || !file.buffer.length) return null;

  const mime = detectImageType(file.buffer);
  if (!mime) throw new Error('That file is not a readable image.');

  const { rows } = await db.query(
    'INSERT INTO files (data, mime, size) VALUES ($1, $2, $3) RETURNING id',
    [file.buffer, mime, file.buffer.length]
  );
  return '/files/' + rows[0].id;
}

async function getFile(id) {
  if (!/^\d+$/.test(String(id))) return null;
  const { rows } = await db.query('SELECT data, mime FROM files WHERE id = $1', [id]);
  return rows[0] || null;
}

module.exports = { upload, saveFile, getFile, MAX_BYTES };
