const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);

  // Oda Oluşturma
  socket.on('createRoom', ({ p1Name }) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      players: [{ id: socket.id, name: p1Name || 'Oyuncu 1', score: 0 }],
      board: [3, 5, 7],
      currentTurn: 0, // 0: P1, 1: P2
      selectedRow: null,
      selectedCount: 0
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerIndex: 0 });
  });

  // Odaya Katılma
  socket.on('joinRoom', ({ roomId, p2Name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('errorMsg', 'Oda bulunamadı!');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('errorMsg', 'Oda dolu!');
      return;
    }

    room.players.push({ id: socket.id, name: p2Name || 'Oyuncu 2', score: 0 });
    socket.join(roomId);

    socket.emit('roomJoined', { roomId, playerIndex: 1 });
    io.to(roomId).emit('gameStart', room);
  });

  // Hamle Seçimi (Chip tıklamaları)
  socket.on('selectChips', ({ roomId, rIdx, count }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.selectedRow = rIdx;
    room.selectedCount = count;
    io.to(roomId).emit('updateSelection', { selectedRow: rIdx, selectedCount: count });
  });

  // Hamleyi Onaylama
  socket.on('confirmTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.selectedRow === null) return;

    room.board[room.selectedRow] -= room.selectedCount;
    room.selectedRow = null;
    room.selectedCount = 0;

    // Oyun Bitti mi? (Misère: Son taşı alan kaybeder)
    const totalRemaining = room.board.reduce((a, b) => a + b, 0);
    if (totalRemaining === 0) {
      const winnerIndex = room.currentTurn === 0 ? 1 : 0;
      room.players[winnerIndex].score++;
      io.to(roomId).emit('gameOver', {
        board: room.board,
        winner: room.players[winnerIndex].name,
        loser: room.players[room.currentTurn].name,
        players: room.players
      });
      return;
    }

    // Sırayı Değiştir
    room.currentTurn = room.currentTurn === 0 ? 1 : 0;
    io.to(roomId).emit('turnUpdate', room);
  });

  // Yeni Raunt
  socket.on('resetGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.board = [3, 5, 7];
    room.selectedRow = null;
    room.selectedCount = 0;
    room.currentTurn = 0;
    io.to(roomId).emit('gameReset', room);
  });

  // Bağlantı Kopması
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        io.to(roomId).emit('errorMsg', 'Rakip oyundan ayrıldı!');
        delete rooms[roomId];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});