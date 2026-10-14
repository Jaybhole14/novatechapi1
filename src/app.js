
const express = require('express');
const db = require('./db');

const app = express();

app.use(express.json({ limit: '100kb' }));

// Wait for the PostgreSQL tasks table to be ready.
app.use((req, res, next) => {
  db.ready.then(() => next()).catch(next);
});

function validId(id) {
  return /^\d+$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0;
}

function validate(body, partial = false) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Body must be a JSON object.'];
  }

  const allowed = ['title', 'description', 'completed'];

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors.push(`Unknown field: ${key}.`);
  }

  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      errors.push('title is required and must be a non-empty string.');
    } else if (body.title.trim().length > 120) {
      errors.push('title must be 120 characters or fewer.');
    }
  }

  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') {
      errors.push('description must be a string.');
    } else if (body.description.length > 1000) {
      errors.push('description must be 1000 characters or fewer.');
    }
  }

  if (
    Object.hasOwn(body, 'completed') &&
    typeof body.completed !== 'boolean'
  ) {
    errors.push('completed must be true or false.');
  }

  if (partial && !allowed.some(key => Object.hasOwn(body, key))) {
    errors.push('Provide at least one field to update.');
  }

  return errors;
}

const taskOut = row => row || null;

app.get('/', (req, res) => {
  res.json({
    name: 'TaskFlow REST API',
    database: 'PostgreSQL',
    docs: '/docs',
    endpoints: [
      'GET /api/tasks',
      'GET /api/tasks/:id',
      'POST /api/tasks',
      'PUT /api/tasks/:id',
      'PATCH /api/tasks/:id',
      'DELETE /api/tasks/:id'
    ]
  });
});

app.get('/docs', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width">
      <title>TaskFlow API Documentation</title>
    </head>
    <body style="font:16px/1.6 system-ui;max-width:850px;margin:35px auto;padding:0 18px">
      <h1>TaskFlow REST API</h1>
      <p>Task management API using Express and PostgreSQL.</p>
      <h2>Task data model</h2>
      <pre>{
  "id": 1,
  "title": "Learn Java",
  "description": "Practice coding",
  "completed": false,
  "created_at": "2026-10-14T12:00:00.000Z"
}</pre>
      <h2>Endpoints</h2>
      <p><b>GET /api/tasks</b> — List all tasks.</p>
      <p><b>GET /api/tasks/:id</b> — Get one task.</p>
      <p><b>POST /api/tasks</b> — Create a task.</p>
      <p><b>PUT /api/tasks/:id</b> — Replace a task.</p>
      <p><b>PATCH /api/tasks/:id</b> — Update selected fields.</p>
      <p><b>DELETE /api/tasks/:id</b> — Delete a task.</p>
      <h2>Example POST body</h2>
      <pre>{
  "title": "Learn REST API",
  "description": "Test TaskFlow",
  "completed": false
}</pre>
      <p>Responses are JSON. Invalid input returns 400; missing tasks return 404.</p>
    </body>
    </html>
  `);
});

// GET all tasks
app.get('/api/tasks', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM tasks ORDER BY id DESC'
  );

  res.status(200).json({
    data: result.rows.map(taskOut),
    count: result.rowCount
  });
});

// GET one task
app.get('/api/tasks/:id', async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      error: 'Task ID must be a positive integer.'
    });
  }

  const result = await db.query(
    'SELECT * FROM tasks WHERE id = $1',
    [Number(req.params.id)]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.json({ data: taskOut(result.rows[0]) });
});

// CREATE task
app.post('/api/tasks', async (req, res) => {
  const errors = validate(req.body);

  if (errors.length) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: errors
    });
  }

  const { title, description = '', completed = false } = req.body;

  const result = await db.query(
    `INSERT INTO tasks (title, description, completed)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [title.trim(), description.trim(), completed]
  );

  res.status(201).json({
    message: 'Task created successfully.',
    data: taskOut(result.rows[0])
  });
});

// REPLACE task
app.put('/api/tasks/:id', async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      error: 'Task ID must be a positive integer.'
    });
  }

  const errors = validate(req.body);

  if (errors.length) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: errors
    });
  }

  const { title, description = '', completed = false } = req.body;

  const result = await db.query(
    `UPDATE tasks
     SET title = $1, description = $2, completed = $3
     WHERE id = $4
     RETURNING *`,
    [title.trim(), description.trim(), completed, Number(req.params.id)]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.json({
    message: 'Task replaced successfully.',
    data: taskOut(result.rows[0])
  });
});

// PARTIALLY UPDATE task
app.patch('/api/tasks/:id', async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      error: 'Task ID must be a positive integer.'
    });
  }

  const errors = validate(req.body, true);

  if (errors.length) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: errors
    });
  }

  const id = Number(req.params.id);

  const oldResult = await db.query(
    'SELECT * FROM tasks WHERE id = $1',
    [id]
  );

  if (!oldResult.rowCount) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const old = oldResult.rows[0];

  const title = Object.hasOwn(req.body, 'title')
    ? req.body.title.trim()
    : old.title;

  const description = Object.hasOwn(req.body, 'description')
    ? req.body.description.trim()
    : old.description;

  const completed = Object.hasOwn(req.body, 'completed')
    ? req.body.completed
    : old.completed;

  const result = await db.query(
    `UPDATE tasks
     SET title = $1, description = $2, completed = $3
     WHERE id = $4
     RETURNING *`,
    [title, description, completed, id]
  );

  res.json({
    message: 'Task updated successfully.',
    data: taskOut(result.rows[0])
  });
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      error: 'Task ID must be a positive integer.'
    });
  }

  const result = await db.query(
    'DELETE FROM tasks WHERE id = $1 RETURNING id',
    [Number(req.params.id)]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.json({
    message: 'Task deleted successfully.',
    id: result.rows[0].id
  });
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON in request body.'
    });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
