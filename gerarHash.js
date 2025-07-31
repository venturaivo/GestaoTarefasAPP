const bcrypt = require('bcryptjs');

async function gerarHash(password) {
  const hash = await bcrypt.hash(password, 10);  // 10 é o custo da encriptação
  console.log('Hash gerado:', hash);
}

const password = process.argv[2];
if (!password) {
  console.log('Por favor, passa a password como argumento.');
  process.exit(1);
}

gerarHash(password);
