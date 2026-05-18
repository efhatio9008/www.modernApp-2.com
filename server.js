const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = 'modernplus';
const PASSWORD_SALT = 'department-dashboard-system-v1';
const PASSWORD_HASH = '70419e5b027066e1e19a3e4147de39cf30a4b6824ea7a292444448215bf9870be47643f3e81bcefdf11d7b9638fe903973094381070b092735a62516a3b368e3';
const SESSION_SECRET = 'department-dashboard-session-secret-change-later';

const DEPARTMENT_ROOTS = [
  'human_resources',
  'procurement',
  'operation',
  'inventory',
  'project_tender',
  'hse',
  'logistics',
  'tba'
];

const DEPARTMENTS_DIR = path.join(__dirname, 'departments');
let activeSessionId = null;
let lastActivityTime = 0;

const SESSION_TIMEOUT = 30 * 60 * 1000;
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  rolling: false,

  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

const TEMP_UPLOAD_DIR = path.join(__dirname, '.tmp_uploads');
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, TEMP_UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

function ensureDepartments() {
  fs.mkdirSync(DEPARTMENTS_DIR, { recursive: true });
  DEPARTMENT_ROOTS.forEach((folder) => fs.mkdirSync(path.join(DEPARTMENTS_DIR, folder), { recursive: true }));
}
ensureDepartments();

function passwordMatches(password) {
  const hash = crypto.scryptSync(password || '', PASSWORD_SALT, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(PASSWORD_HASH, 'hex'));
}

function requireLogin(req, res, next) {

  // AUTO RELEASE EXPIRED SESSION
  if (
    activeSessionId &&
    Date.now() - lastActivityTime > SESSION_TIMEOUT
  ) {
    activeSessionId = null;
  }

  if (
    req.session &&
    req.session.loggedIn &&
    req.session.id === activeSessionId
  ) {

    // UPDATE ACTIVITY
    lastActivityTime = Date.now();

    return next();
  }

  res.status(401).json({
    success: false,
    message: 'Not logged in.'
  });

}

function safeRelative(value) {
  const clean = String(value || '').replace(/\\/g, '/');
  if (clean.includes('\0')) throw new Error('Invalid path.');
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (normalized === '.' || normalized.startsWith('..')) throw new Error('Invalid path.');
  return normalized;
}

function departmentRoot(department) {
  if (!DEPARTMENT_ROOTS.includes(department)) throw new Error('Invalid department.');
  return path.join(DEPARTMENTS_DIR, department);
}

function resolveDepartmentPath(department, relativePath = '') {
  const root = departmentRoot(department);
  const safeRel = relativePath ? safeRelative(relativePath) : '';
  const target = path.resolve(root, safeRel);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid path.');
  return target;
}

function listFolder(department, relativePath) {
  const folderPath = resolveDepartmentPath(department, relativePath);
  fs.mkdirSync(folderPath, { recursive: true });
  return fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((item) => !item.name.startsWith('.') && item.name !== '__deleted_items')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((item) => ({ name: item.name, isFolder: item.isDirectory(), ext: path.extname(item.name) }));
}

function getTrashFolder(department) {
  return path.join(departmentRoot(department), '__deleted_items');
}

function getTrashMetaFile(department) {
  return path.join(getTrashFolder(department), 'trash-meta.json');
}

function getTrashRecords(department) {
  try {
    const metaFile = getTrashMetaFile(department);
    if (!fs.existsSync(metaFile)) return [];
    const data = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to read trash records:', error);
    return [];
  }
}

function saveTrashRecords(department, records) {
  fs.mkdirSync(getTrashFolder(department), { recursive: true });
  fs.writeFileSync(getTrashMetaFile(department), JSON.stringify(records, null, 2));
}

function saveTrashRecord(department, record) {
  const records = getTrashRecords(department);
  records.unshift(record);
  saveTrashRecords(department, records);
}

function getAvailablePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let count = 1;
  let nextPath = path.join(parsed.dir, `${parsed.name} (${count})${parsed.ext}`);
  while (fs.existsSync(nextPath)) {
    count++;
    nextPath = path.join(parsed.dir, `${parsed.name} (${count})${parsed.ext}`);
  }
  return nextPath;
}

function moveItemToTrash(department, relativePath) {
  const itemPath = resolveDepartmentPath(department, relativePath);
  if (!fs.existsSync(itemPath)) throw new Error('Item does not exist.');
  const stat = fs.statSync(itemPath);
  const trashFolder = getTrashFolder(department);
  fs.mkdirSync(trashFolder, { recursive: true });
  const deletedName = `${Date.now()}_${Math.random().toString(16).slice(2)}_${path.basename(itemPath)}`;
  const deletedPath = path.join(trashFolder, deletedName);
  fs.renameSync(itemPath, deletedPath);
  saveTrashRecord(department, {
    id: deletedName,
    originalName: path.basename(itemPath),
    originalRelativePath: safeRelative(relativePath),
    deletedPath,
    deletedAt: new Date().toLocaleString(),
    isFolder: stat.isDirectory()
  });
}

function removeTrashRecordFile(record) {
  if (record.deletedPath && fs.existsSync(record.deletedPath)) {
    const stat = fs.statSync(record.deletedPath);
    if (stat.isDirectory()) fs.rmSync(record.deletedPath, { recursive: true, force: true });
    else fs.unlinkSync(record.deletedPath);
  }
}

function restoreTrashRecord(department, record) {
  if (!fs.existsSync(record.deletedPath)) return false;
  const restorePath = resolveDepartmentPath(department, record.originalRelativePath);
  const finalRestorePath = fs.existsSync(restorePath) ? getAvailablePath(restorePath) : restorePath;
  fs.mkdirSync(path.dirname(finalRestorePath), { recursive: true });
  fs.renameSync(record.deletedPath, finalRestorePath);
  return true;
}

app.post('/api/login', (req, res) => {

  const { username, password } = req.body || {};

  if (
    username !== ADMIN_USERNAME ||
    !passwordMatches(password)
  ) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password.'
    });
  }

  // BLOCK SECOND LOGIN
  if (
    activeSessionId &&
    activeSessionId !== req.session.id
  ) {
    return res.status(403).json({
      success: false,
      message: 'Account already logged in on another device.'
    });
  }

  req.session.loggedIn = true;

  activeSessionId = req.session.id;
  lastActivityTime = Date.now();
  res.json({
    success: true
  });

});

app.post('/api/logout', (req, res) => {

  if (
    req.session &&
    req.session.id === activeSessionId
  ) {
    activeSessionId = null;
    lastActivityTime = 0;
  }

  req.session.destroy(() => {
    res.json({ success: true });
  });

});

app.get('/api/session', (req, res) => {
  res.json({
    loggedIn: !!(
      req.session &&
      req.session.loggedIn &&
      req.session.id === activeSessionId
    )
  });
});

app.get('/api/list', requireLogin, (req, res) => {
  try {
    const department = req.query.department;
    const relativePath = req.query.path || '';
    res.json({ success: true, items: listFolder(department, relativePath) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/create-folder', requireLogin, (req, res) => {
  try {
    const { department, parentPath, folderName } = req.body || {};
    if (!folderName || folderName.includes('/') || folderName.includes('\\')) throw new Error('Invalid folder name.');
    const target = resolveDepartmentPath(department, path.posix.join(parentPath || '', folderName.trim()));
    if (fs.existsSync(target)) throw new Error('A folder with this name already exists.');
    fs.mkdirSync(target, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/rename', requireLogin, (req, res) => {
  try {
    const { department, itemPath, newName } = req.body || {};
    if (!newName || newName.includes('/') || newName.includes('\\')) throw new Error('Invalid name.');
    const oldPath = resolveDepartmentPath(department, itemPath);
    if (!fs.existsSync(oldPath)) throw new Error('Item does not exist.');
    const target = path.join(path.dirname(oldPath), newName.trim());
    if (fs.existsSync(target)) throw new Error('A file or folder with this name already exists.');
    fs.renameSync(oldPath, target);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/delete', requireLogin, (req, res) => {
  try {
    moveItemToTrash(req.body.department, req.body.itemPath);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/bulk-delete', requireLogin, (req, res) => {
  const { department, itemPaths } = req.body || {};
  let successCount = 0;
  let failCount = 0;
  (Array.isArray(itemPaths) ? itemPaths : []).forEach((itemPath) => {
    try { moveItemToTrash(department, itemPath); successCount++; } catch (error) { failCount++; }
  });
  res.json({ success: true, successCount, failCount });
});

app.post('/api/upload', requireLogin, upload.array('files'), (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    const department = req.body.department;
    const parentPath = req.body.parentPath || '';
    const relativePaths = Array.isArray(req.body.relativePaths) ? req.body.relativePaths : [req.body.relativePaths].filter(Boolean);

    uploadedFiles.forEach((file, index) => {
      const relName = safeRelative(relativePaths[index] || file.originalname);
      const target = resolveDepartmentPath(department, path.posix.join(parentPath, relName));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(file.path, target);
    });

    res.json({ success: true });
  } catch (error) {
    uploadedFiles.forEach((file) => {
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.error('Failed to clean temporary upload:', cleanupError);
      }
    });

    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/trash', requireLogin, (req, res) => {
  try {
    const department = req.query.department;
    const records = getTrashRecords(department).filter((record) => record && record.deletedPath && fs.existsSync(record.deletedPath));
    res.json({ success: true, records });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/restore', requireLogin, (req, res) => {
  try {
    const { department, recordIds } = req.body || {};
    const ids = Array.isArray(recordIds) ? recordIds : [req.body.recordId].filter(Boolean);
    const records = getTrashRecords(department);
    let successCount = 0;
    let failCount = 0;
    const successfulIds = new Set();
    records.filter((item) => ids.includes(item.id)).forEach((record) => {
      try { if (restoreTrashRecord(department, record)) successCount++; else failCount++; successfulIds.add(record.id); } catch (error) { failCount++; }
    });
    saveTrashRecords(department, records.filter((item) => !successfulIds.has(item.id)));
    res.json({ success: true, successCount, failCount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/delete-forever', requireLogin, (req, res) => {
  try {
    const { department, recordIds } = req.body || {};
    const ids = Array.isArray(recordIds) ? recordIds : [req.body.recordId].filter(Boolean);
    const records = getTrashRecords(department);
    let successCount = 0;
    let failCount = 0;
    const successfulIds = new Set();
    records.filter((item) => ids.includes(item.id)).forEach((record) => {
      try { removeTrashRecordFile(record); successfulIds.add(record.id); successCount++; } catch (error) { failCount++; }
    });
    saveTrashRecords(department, records.filter((item) => !successfulIds.has(item.id)));
    res.json({ success: true, successCount, failCount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/download', requireLogin, (req, res) => {
  try {
    const target = resolveDepartmentPath(req.query.department, req.query.path || '');

    if (!fs.existsSync(target)) {
      return res.status(404).send('Not found');
    }

    const stat = fs.statSync(target);

    // FILE DOWNLOAD / PREVIEW
    if (!stat.isDirectory()) {

      const ext = path.extname(target).toLowerCase();

      // PDF PREVIEW
      if (ext === '.pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');

        return fs.createReadStream(target).pipe(res);
      }

      // IMAGE PREVIEW
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {

        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };

        res.setHeader('Content-Type', mimeTypes[ext]);
        res.setHeader('Content-Disposition', 'inline');

        return fs.createReadStream(target).pipe(res);
      }

      // OTHER FILES = DOWNLOAD
      return res.download(target);
    }

    // FOLDER ZIP DOWNLOAD
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(target)}.zip"`
    );

    const archive = archiver('zip', {
      zlib: { level: 3 }
    });

    archive.on('error', (error) => {
      res.status(500).send(error.message);
    });

    archive.pipe(res);

    archive.directory(target, path.basename(target));

    archive.finalize();

  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.listen(PORT, () => console.log(`Department dashboard running on port ${PORT}`));