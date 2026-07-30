const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const db = require('./db/init');

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
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"]
  }
}));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', require('./routes/api'));
app.use('/p', require('./routes/public'));

// Login page
app.get('/login', (req, res) => {
  res.render('login');
});

// DPP Hub (admin)
app.get('/admin-edit', (req, res) => {
  res.render('admin-edit');
});

// Search & view page
app.get('/search', (req, res) => {
  res.render('search');
});

// Home redirect
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ DPP Hub: http://localhost:${PORT}/admin-edit`);
  console.log(`✓ Public passport: http://localhost:${PORT}/p/114519-001-AA`);
});

module.exports = app;
