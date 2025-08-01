// server.js
require('dotenv').config(); // <-- Carrega variáveis do .env sempre no topo

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- CORS mais seguro (ajusta o origin para o domínio do frontend em produção) ---
app.use(cors({
  origin: ["https://tarefas.v3dsi.com", "http://localhost:3000"], // frontend React
  credentials: true
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'segredo-super-secreto-123';

// Configuração da ligação MySQL usando variáveis de ambiente
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT || 3306,
});

// Middleware de autenticação JWT simples
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // LOG INPUTS
    console.log("Tentativa de login:", email);

    // Query utilizador
    const [rows] = await pool.query('SELECT * FROM utilizadores WHERE email = ?', [email]);
    if (rows.length === 0) {
      console.log("Utilizador não encontrado:", email);
      return res.status(401).json({ error: 'Utilizador não encontrado' });
    }

    const user = rows[0];
    // LOG: Vê se a password recebida está ok
    // console.log("Password enviada:", password, "Password hash na BD:", user.password);

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log("Password incorreta para:", email);
      return res.status(401).json({ error: 'Password incorreta' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email } });
  } catch (err) {
    console.error("ERRO DETALHADO LOGIN:", err); // <--- Isto mostra erro real nos logs do Render
    res.status(500).json({ error: 'Erro no login' });
  }
});

// === TAREFAS ===
app.get('/api/tarefas', autenticarToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tarefas WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tarefas', autenticarToken, async (req, res) => {
  const { nome, prioridade, prazo, tempo = '0m', notas = '' } = req.body;
  const user_id = req.user.id;
  try {
    const [result] = await pool.query(
      'INSERT INTO tarefas (nome, prioridade, prazo, tempo, notas, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, prioridade, prazo, tempo, notas, user_id]
    );
    res.status(201).json({ id: result.insertId, nome, prioridade, prazo, tempo, notas, user_id });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar tarefa" });
  }
});

app.put('/api/tarefas/:id', autenticarToken, async (req, res) => {
  const { nome, prioridade, prazo } = req.body;
  const { id } = req.params;
  const user_id = req.user.id;
  try {
    const [result] = await pool.query(
      'UPDATE tarefas SET nome = ?, prioridade = ?, prazo = ? WHERE id = ? AND user_id = ?',
      [nome, prioridade, prazo, id, user_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarefa não encontrada ou sem permissão' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tarefas/:id/concluir', autenticarToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  try {
    const [result] = await pool.query(
      'UPDATE tarefas SET concluida = 1 WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarefa não encontrada ou sem permissão' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tarefas/:id', autenticarToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  try {
    const [result] = await pool.query(
      'DELETE FROM tarefas WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarefa não encontrada ou sem permissão' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ATIVIDADES ===
app.get('/api/atividades', autenticarToken, async (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT a.* 
    FROM atividades a
    JOIN tarefas t ON a.tarefa_id = t.id
    WHERE t.user_id = ?
  `;
  let params = [req.user.id];

  if (start && end) {
    query += ' AND a.data BETWEEN ? AND ?';
    params.push(start, end);
  }
  query += ' ORDER BY a.data, a.hora_inicio';

  try {
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/atividades/:tarefaId', autenticarToken, async (req, res) => {
  const { tarefaId } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM atividades WHERE tarefa_id = ?', [tarefaId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/atividades', autenticarToken, async (req, res) => {
  const { tarefa_id, data, hora_inicio, hora_fim, observacoes } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO atividades (tarefa_id, data, hora_inicio, hora_fim, observacoes) VALUES (?, ?, ?, ?, ?)',
      [tarefa_id, data, hora_inicio, hora_fim, observacoes]
    );
    res.status(201).json({ id: result.insertId, tarefa_id, data, hora_inicio, hora_fim, observacoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === NOTAS ===

// Adicionar nova nota a uma tarefa
app.post('/api/notas', autenticarToken, async (req, res) => {
  const { tarefa_id, texto, data, hora } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO notas (tarefa_id, texto, data, hora) VALUES (?, ?, ?, ?)',
      [tarefa_id, texto, data, hora]
    );
    res.status(201).json({ id: result.insertId, tarefa_id, texto, data, hora });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar notas de uma tarefa
app.get('/api/notas/:tarefaId', autenticarToken, async (req, res) => {
  const { tarefaId } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notas WHERE tarefa_id = ? ORDER BY data DESC, hora DESC',
      [tarefaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de teste
app.get('/', (req, res) => {
  res.send('API TarefasApp online! 😎');
});

// Arrancar servidor com host 0.0.0.0 para aceitar ligações externas (Render, Railway, etc)
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`API a correr em http://${HOST}:${PORT}`);
});
