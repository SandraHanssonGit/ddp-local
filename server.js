const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

// Load appropriate database based on version
const dbVersion = process.env.DB_VERSION || 'v1';
const db = require(dbVersion === 'v2' ? './db/init-v2' : './db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate JWT_SECRET (required for security)
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable not set.');
  console.error('   Set it before starting: export JWT_SECRET="your-secure-random-string"');
  console.error('   Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// Security middleware
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
    scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
    scriptSrcAttr: ["'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"]
  }
}));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.redirect('/login');
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.redirect('/login');
  }
};

// Routes
app.use('/api', require('./routes/api'));
app.use('/p', require('./routes/public'));

// Consumer DPP routes (both v1 and v2)
if (dbVersion === 'v2') {
  app.use('/dpp', require('./routes/public/consumer'));
  app.use('/api/passport', require('./routes/public/consumer'));
}

// V2 Admin API routes (if running v2)
if (dbVersion === 'v2') {
  app.use('/api/admin/styles', require('./routes/admin/styles'));
  app.use('/api/admin/fields', require('./routes/admin/fields'));
  app.use('/api/admin/passports', require('./routes/admin/passports'));
  app.use('/api/admin/overrides', require('./routes/admin/overrides'));
  app.use('/api/admin/lifecycle', require('./routes/admin/lifecycle'));
  app.use('/api/admin/config', require('./routes/admin/config'));

  // V2 Admin UI routes
  app.use('/admin-config', requireAuth, require('./routes/admin/config'));
  app.use('/admin-v2', requireAuth, require('./routes/admin/hub-v2'));
}

// Login page
app.get('/login', (req, res) => {
  res.render('login');
});

// DPP Hub (admin) - requires authentication
if (dbVersion === 'v2') {
  app.get('/admin-edit', requireAuth, (req, res) => {
    res.redirect('/admin-v2');
  });
} else {
  app.get('/admin-edit', requireAuth, (req, res) => {
    res.render('admin-edit');
  });
}

// Home redirect
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Start server
app.listen(PORT, () => {
  const hubUrl = dbVersion === 'v2' ? `/admin-v2` : `/admin-edit`;
  console.log(`\n✓ DPP ${dbVersion.toUpperCase()} Server running at http://localhost:${PORT}`);
  console.log(`✓ Database: ${process.env.DB_PATH || 'database.db'}`);
  console.log(`✓ DPP Hub: http://localhost:${PORT}${hubUrl}`);
  console.log(`✓ Public passport: http://localhost:${PORT}/dpp/ABC001\n`);
});

module.exports = app;
