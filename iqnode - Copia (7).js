
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Broker = require('iqoption');
const path = require('path');

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
  tentarReconectar();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promessa não tratada:', reason);
  tentarReconectar();
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const broker = new Broker({
  email: 'danilo.santos1998@hotmail.com',
  password: 'xxxxxx'
});

let ultimaCotacao = null;
const historico = [];

async function iniciarBroker() {
  try {
    console.log('🔐 Fazendo login...');
    await broker.login();
    console.log('✅ Login realizado.');

    console.log('📡 Conectando ao broker...');
    await broker.connect();
    console.log('✅ Conectado ao broker.');

    await broker.subscribe('candle-generated', { active_id: 76, size: 1 });
    console.log('📈 Inscrito em "candle-generated".');

    broker.on('candle-generated', handleCandle);
  } catch (err) {
    console.error('❌ Erro ao iniciar broker:', err);
    tentarReconectar();
  }
}

function handleCandle(tick) {
  try {
    const { close, at } = tick;
    const horario = new Date(at * 1000).toLocaleTimeString('pt-BR');
    let variacao = 0;

    if (ultimaCotacao !== null) {
      variacao = ((close - ultimaCotacao) / ultimaCotacao) * 100;
    }

    ultimaCotacao = close;

    historico.push({
      preco: close.toFixed(6),
      horario,
      variacao: variacao.toFixed(9)
    });

    if (historico.length > 100) historico.shift();

    const subidas = historico.filter(v => v.variacao > 0).length;
    const quedas = historico.filter(v => v.variacao < 0).length;
    const estaveis = historico.filter(v => v.variacao == 0).length;
    const total = historico.length;

    const stats = {
      pctSubida: ((subidas / total) * 100).toFixed(2),
      pctQueda: ((quedas / total) * 100).toFixed(2),
      pctEstavel: ((estaveis / total) * 100).toFixed(2)
    };

    const payload = { historico, stats };

    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });

    console.log(`[${horario}] Preço: ${close.toFixed(6)} | Variação: ${variacao.toFixed(6)}%`);
  } catch (err) {
    console.error('❌ Erro ao processar candle:', err);
  }
}

function tentarReconectar() {
  console.log('🔄 Tentando reconectar em 5 segundos...');
  setTimeout(() => {
    iniciarBroker();
  }, 5000);
}

broker.on('disconnected', () => {
  console.warn('🔌 Desconectado do broker.');
  tentarReconectar();
});

// Inicia a lógica
iniciarBroker();

// Inicia o servidor
server.listen(3000, () => {
  console.log('🚀 Servidor rodando em http://localhost:3000');
});
