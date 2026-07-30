const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', require('./routes/api'));
app.use('/p', require('./routes/public'));

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
  res.redirect('/admin-edit');
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ DPP Hub: http://localhost:${PORT}/admin-edit`);
  console.log(`✓ Public passport: http://localhost:${PORT}/p/114519-001-AA`);
});

module.exports = app;
