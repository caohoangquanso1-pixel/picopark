const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentLevelIndex = 0;
const MAP_WIDTH = 3000; 

// HỆ THỐNG MAP LIÊN KẾT LIỀN MẠCH (Mẫu 5 map chuẩn, bạn có thể copy thêm để đủ 30 map)
const levels = [
    {   // Map 1: Khởi Động & Khối Tàng Hình (Làm quen nhảy bóp nhau)
        key: { x: 1400, y: 150, collected: false }, door: { x: 2600, y: 200, win: false },
        platforms: [
            { x: 0, y: 500, width: 800, height: 40 },
            { x: 900, y: 400, width: 200, height: 20, type: 'bounce' }, // Lò xo
            { x: 1300, y: 200, width: 200, height: 20 },
            { x: 1700, y: 400, width: 200, height: 20, type: 'invisible' }, // Khối tàng hình troll
            { x: 2100, y: 300, width: 800, height: 40 }
        ],
        spikes: [{ x: 800, y: 580, width: 2000, height: 20 }] // Trượt chân là chết
    },
    {   // Map 2: Thung Lũng Gió (Dùng khối gió bay lên)
        key: { x: 1500, y: 50, collected: false }, door: { x: 2600, y: 460, win: false },
        platforms: [
            { x: 0, y: 500, width: 500, height: 40 },
            { x: 1400, y: 100, width: 200, height: 20 },
            { x: 2400, y: 500, width: 600, height: 40 }
        ],
        wind: [
            { x: 600, y: 200, width: 200, height: 400, forceY: -8 }, // Quạt gió thổi lên
            { x: 1800, y: 200, width: 400, height: 400, forceY: -5 }
        ],
        lava: [{ x: 500, y: 580, width: 1900, height: 20 }]
    },
    {   // Map 3: Băng Mỏng Trượt & Lò Xo Chết Chóc
        key: { x: 1400, y: 400, collected: false }, door: { x: 2500, y: 260, win: false },
        platforms: [
            { x: 0, y: 300, width: 400, height: 20 },
            { x: 500, y: 400, width: 300, height: 20, type: 'ice' },
            { x: 900, y: 500, width: 300, height: 20, type: 'ice' },
            { x: 1300, y: 450, width: 200, height: 20, type: 'bounce' },
            { x: 2000, y: 300, width: 800, height: 20 }
        ],
        spikes: [{ x: 0, y: 580, width: 3000, height: 20 }]
    },
    {   // Map 4: Bơi Dưới Nước & Mật Ong Trói Chân
        key: { x: 1200, y: 450, collected: false }, door: { x: 2400, y: 160, win: false },
        platforms: [
            { x: 0, y: 200, width: 400, height: 40 },
            { x: 2000, y: 200, width: 600, height: 40 },
            { x: 900, y: 520, width: 600, height: 20, type: 'honey' }
        ],
        water: [{ x: 400, y: 250, width: 1600, height: 350 }],
        enemies: [{ id: 1, x: 1000, y: 350, width: 32, height: 32, vx: 3, type: 'chaser' }]
    },
    {   // Map 5: Tổ Hợp Khổ Đau (Cần sự hi sinh)
        key: { x: 1500, y: 100, collected: false }, door: { x: 2600, y: 460, win: false },
        platforms: [
            { x: 0, y: 500, width: 400, height: 40 },
            { x: 400, y: 100, width: 40, height: 400 }, // Bức tường chặn
            { x: 800, y: 300, width: 100, height: 20, type: 'bounce' },
            { x: 1400, y: 150, width: 200, height: 20, type: 'invisible' },
            { x: 2000, y: 500, width: 800, height: 40 }
        ],
        lava: [{ x: 440, y: 580, width: 1560, height: 20 }],
        wind: [{ x: 1000, y: 150, width: 300, height: 450, forceX: 5 }] // Gió thổi ngang
    }
];

let gameState = {};
function initLevel(index) {
    if (index >= levels.length) {
        gameState.gameFinished = true;
    } else {
        currentLevelIndex = index;
        let lvl = JSON.parse(JSON.stringify(levels[index]));
        gameState = {
            levelIndex: currentLevelIndex,
            key: lvl.key, door: lvl.door,
            platforms: lvl.platforms || [], spikes: lvl.spikes || [],
            lava: lvl.lava || [], water: lvl.water || [],
            wind: lvl.wind || [], enemies: lvl.enemies || [],
            gameFinished: false
        };
        Object.keys(players).forEach((id, i) => {
            players[id].x = 50 + (i * 40);
            players[id].y = 50; // Cho rơi từ trên cao xuống
        });
    }
    io.emit('currentPlayers', players);
    io.emit('gameState', gameState);
}

// SERVER LOOP UPDATE 60FPS
setInterval(() => {
    if (gameState.gameFinished || !gameState.enemies) return;
    gameState.enemies.forEach(enemy => {
        if (enemy.type === 'chaser') {
            let closestPlayer = null; let minDist = 9999;
            Object.keys(players).forEach(id => {
                let p = players[id]; let dist = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y);
                if (dist < minDist) { minDist = dist; closestPlayer = p; }
            });
            if (closestPlayer) {
                enemy.x += enemy.x < closestPlayer.x ? 1.5 : -1.5;
                enemy.y += enemy.y < closestPlayer.y ? 1.5 : -1.5;
            }
        }
    });
    io.emit('updateDynamicObjects', { enemies: gameState.enemies });
}, 16.66);

io.on('connection', (socket) => {
    players[socket.id] = {
        id: socket.id, x: 50, y: 50, facing: 'right',
        color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'][Object.keys(players).length % 7]
    };
    if (Object.keys(players).length === 1) initLevel(0);
    
    socket.emit('currentPlayers', players);
    socket.emit('gameState', gameState);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x; players[socket.id].y = data.y; players[socket.id].facing = data.facing;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // CƠ CHẾ BÓP ĐỒNG ĐỘI: Nhận lệnh ai đó bị tông, gửi lệnh văng đi cho nạn nhân
    socket.on('bumpPlayer', (data) => {
        io.to(data.targetId).emit('getBumped', { vx: data.vx, vy: data.vy });
    });

    socket.on('teamDied', () => { initLevel(currentLevelIndex); });
    
    socket.on('updateGameState', (updatedState) => {
        if (updatedState.door && updatedState.door.win) { initLevel(currentLevelIndex + 1); }
        else { gameState.key = updatedState.key || gameState.key; io.emit('gameState', gameState); }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('playerDisconnected', socket.id); });
});

// Thay vì cố định port 3000, dùng biến môi trường của Server online
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server Pico Park chạy tại port ${PORT}`));