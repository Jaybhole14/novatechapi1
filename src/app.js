const express = require('express');
const db = require('./db');
const app = express();
app.use(express.json({ limit: '100kb' }));
const taskOut = row => row && ({ ...row, completed: Boolean(row.completed) });
const validId = id => /^\d+$/.test(id) && Number(id) > 0;
function validate(body, partial = false) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['Body must be a JSON object.'];
  const allowed = ['title', 'description', 'completed'];
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors.push(`Unknown field: ${key}.`);
  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) errors.push('title is required and must be a non-empty string.');
    else if (body.title.trim().length > 120) errors.push('title must be 120 characters or fewer.');
  }
  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') errors.push('description must be a string.');
    else if (body.description.length > 1000) errors.push('description must be 1000 characters or fewer.');
  }
  if (Object.hasOwn(body, 'completed') && typeof body.completed !== 'boolean') errors.push('completed must be true or false.');
  if (partial && !allowed.some(k => Object.hasOwn(body, k))) errors.push('Provide at least one field to update.');
  return errors;
}
app.get('/', (req, res) => res.json({ name: 'TaskFlow REST API', docs: '/docs', endpoints: ['GET /api/tasks', 'GET /api/tasks/:id', 'POST /api/tasks', 'PUT /api/tasks/:id', 'PATCH /api/tasks/:id', 'DELETE /api/tasks/:id'] }));
app.get('/docs', (req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TaskFlow API Docs</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:35px auto;padding:0 18px;color:#222}code,pre{background:#f1f3f5;padding:3px 6px;border-radius:4px}.endpoint{border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:12px 0}</style></head><body><h1>TaskFlow REST API</h1><p>Task management API using Express and SQLite. Requests and responses use JSON.</p><h2>Task data model</h2><pre>{ "id": 1, "title": "Study Java", "description": "Practice", "completed": false, "created_at": "2026-10-14 12:00:00" }</pre><h2>Endpoints</h2><div class="endpoint"><b>GET /api/tasks</b><p>List tasks. Returns 200.</p></div><div class="endpoint"><b>GET /api/tasks/:id</b><p>Read one task. Returns 200, 400 for invalid ID, 404 if missing.</p></div><div class="endpoint"><b>POST /api/tasks</b><p>Create task. JSON example: <code>{"title":"Study Java","description":"Practice","completed":false}</code>. Returns 201; invalid input returns 400.</p></div><div class="endpoint"><b>PUT /api/tasks/:id</b><p>Replace a task; title is required. Returns 200, 400 or 404.</p></div><div class="endpoint"><b>PATCH /api/tasks/:id</b><p>Update selected fields, e.g. <code>{"completed":true}</code>. Returns 200, 400 or 404.</p></div><div class="endpoint"><b>DELETE /api/tasks/:id</b><p>Delete task. Returns 200 or 404.</p></div><h2>Error response</h2><pre>{"error":"Validation failed.","details":["title is required and must be a non-empty string."]}</pre><p>See README.md and API-DOCUMENTATION.md for setup and examples.</p></body></html>`));
app.get('/api/tasks', (req, res) => { const rows = db.prepare('SELECT * FROM tasks ORDER BY id DESC').all().map(taskOut); res.status(200).json({ data: rows, count: rows.length }); });
app.get('/api/tasks/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Task ID must be a positive integer.' });
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Task not found.' });
  res.json({ data: taskOut(row) });
});
app.post('/api/tasks', (req, res) => {
  const errors = validate(req.body); if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });
  const result = db.prepare('INSERT INTO tasks (title, description, completed) VALUES (?, ?, ?)').run(req.body.title.trim(), (req.body.description || '').trim(), req.body.completed ? 1 : 0);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Task created successfully.', data: taskOut(row) });
});
app.put('/api/tasks/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Task ID must be a positive integer.' });
  const errors = validate(req.body); if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });
  const id = Number(req.params.id); if (!db.prepare('SELECT id FROM tasks WHERE id = ?').get(id)) return res.status(404).json({ error: 'Task not found.' });
  db.prepare('UPDATE tasks SET title=?, description=?, completed=? WHERE id=?').run(req.body.title.trim(), (req.body.description || '').trim(), req.body.completed ? 1 : 0, id);
  res.json({ message: 'Task replaced successfully.', data: taskOut(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)) });
});
app.patch('/api/tasks/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Task ID must be a positive integer.' });
  const errors = validate(req.body, true); if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });
  const id = Number(req.params.id); const old = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if (!old) return res.status(404).json({ error: 'Task not found.' });
  const next = { title: Object.hasOwn(req.body,'title') ? req.body.title.trim() : old.title, description: Object.hasOwn(req.body,'description') ? req.body.description.trim() : old.description, completed: Object.hasOwn(req.body,'completed') ? (req.body.completed ? 1 : 0) : old.completed };
  db.prepare('UPDATE tasks SET title=?, description=?, completed=? WHERE id=?').run(next.title,next.description,next.completed,id);
  res.json({ message: 'Task updated successfully.', data: taskOut(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)) });
});
app.delete('/api/tasks/:id', (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Task ID must be a positive integer.' });
  const result = db.prepare('DELETE FROM tasks WHERE id=?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Task not found.' });
  res.json({ message: 'Task deleted successfully.', id: Number(req.params.id) });
});
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) return res.status(400).json({ error: 'Invalid JSON in request body.' });
  console.error(err); res.status(500).json({ error: 'Internal server error.' });
});
module.exports = app;
