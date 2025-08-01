require('dotenv').config(); // Garante que carrega as variáveis do .env

const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');
const cron = require('node-cron');

// LIGAÇÃO AO MYSQL usando variáveis do .env
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT || 3306,
});

// BUSCA TAREFAS ATIVAS
async function buscarTarefasAtivas() {
  const [rows] = await pool.query('SELECT * FROM tarefas WHERE concluida = 0 ORDER BY prioridade DESC, prazo ASC');
  return rows;
}

// ENVIA EMAIL COM TABELA
async function enviarEmail(tarefas) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // do .env
      pass: process.env.EMAIL_PASS  // do .env
    }
  });

  // TABELA HTML BONITA
  let html = `
    <h2 style="font-family:Montserrat,Arial,sans-serif;color:#1b2b48;">Resumo Diário das Tarefas Ativas</h2>
    <table style="border-collapse:collapse;width:98%;margin-bottom:18px;font-family:Inter,Arial,sans-serif;">
      <thead>
        <tr style="background:#f0f4fa;">
          <th style="padding:9px 12px;border:1px solid #e4e9f1;">Nome</th>
          <th style="padding:9px 12px;border:1px solid #e4e9f1;">Prioridade</th>
          <th style="padding:9px 12px;border:1px solid #e4e9f1;">Prazo</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (tarefas.length === 0) {
    html += `<tr><td colspan="3" style="text-align:center;padding:18px;color:#7b879b;">Não há tarefas ativas.</td></tr>`;
  } else {
    tarefas.forEach(tarefa => {
      html += `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e4e9f1;">${tarefa.nome}</td>
          <td style="padding:8px 12px;border:1px solid #e4e9f1;">${tarefa.prioridade}</td>
          <td style="padding:8px 12px;border:1px solid #e4e9f1;">${tarefa.prazo}</td>
        </tr>
      `;
    });
  }

  html += `
      </tbody>
    </table>
    <a href="${process.env.APP_URL}" target="_blank"
      style="display:inline-block;padding:12px 32px;background:#2b6be3;color:#fff;border-radius:8px;font-weight:bold;
      text-decoration:none;font-family:Montserrat,sans-serif;letter-spacing:.03em;margin-top:10px;">
      Abrir aplicação
    </a>
    <br/><br/>
    <div style="font-size:13px;color:#8f99ae;">Este é um email automático gerado pela TarefasApp.</div>
  `;

  // ENVIA EMAIL
  await transporter.sendMail({
    from: `"TarefasApp" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: 'Tarefas Ativas - Resumo Diário',
    html
  });
}

// FUNÇÃO PRINCIPAL
async function main() {
  try {
    const tarefas = await buscarTarefasAtivas();
    await enviarEmail(tarefas);
    console.log('Email enviado com tabela e link!', new Date().toLocaleString());
  } catch (err) {
    console.error('Erro:', err);
  }
}

// -------------- AGENDAMENTO AUTOMÁTICO --------------
// Vai correr todos os dias às 08:30 da manhã (hora do sistema!)
cron.schedule('30 8 * * *', () => {
  main();
});

// Se quiseres correr manualmente (só quando executas diretamente)
if (require.main === module) {
  main();
}
