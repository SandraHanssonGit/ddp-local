const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
const indexRouter = require('./routes/index');
const stylesRouter = require('./routes/styles');
const variantsRouter = require('./routes/variants');
const batchesRouter = require('./routes/batches');
const publicRouter = require('./routes/public');

app.use('/', indexRouter);
app.use('/styles', stylesRouter);
app.use('/variants', variantsRouter);
app.use('/batches', batchesRouter);
app.use('/', publicRouter);

app.listen(PORT, () => {
  console.log(`DPP Server running at http://localhost:${PORT}`);
});

module.exports = app;
