const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentLevelIndex = 0;
const MAP_WIDTH = 3000; 

// HỆ THỐNG MAP ĐÃ ĐƯỢC THIẾT KẾ LẠI (Dễ nhảy hơn, yêu cầu đứng lên đầu nhau)
const levels = [
    {   // Map 1: Bài học vỡ lòng (Bắt buộc đứng lên đầu nhau để qua tường cao)
        key: { x: 900, y: 350, collected: false }, door: { x: 1800, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 600, height: 60 },
            { x: 600, y: 200, width: 40, height: 300 }, // Bức tường cao chắn ngang
            { x: 640, y: 440, width: 1400, height: 60 }
        ],
        spikes: []
    },
    {   // Map 2: Vực thẳm & Quạt gió (Khoảng cách nhảy an toàn)
        key: { x: 1200, y: 150, collected: false }, door: { x: 2200, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 550, y: 440, width: 200, height: 60 },
            { x: 900, y: 440, width: 400, height: 60 },
            { x: 1500, y: 250, width: 200, height: 20 },
            { x: 1900, y: 440, width: 500, height: 60 }
        ],
        wind: [
            { x: 1400, y: 100, width: 400, height: 500, forceY: -8 } // Quạt gió hỗ trợ bay lên nền cao
        ],
        lava: [{ x: 400, y: 550, width: 1500, height: 50 }]
    },
    {   // Map 3: Băng trượt & Kẻ thù đi tuần
        key: { x: 1000, y: 350, collected: false }, door: { x: 2000, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 400, y: 440, width: 400, height: 60, type: 'ice' },
            { x: 900, y: 440, width: 400, height: 60, type: 'ice' },
            { x: 1400, y: 440, width: 800, height: 60 }
        ],
        spikes: [{ x: 0, y: 550, width: 2500, height: 50 }],
        enemies: [
            { id: 1, x: 1500, y: 408, width: 32, height: 32, vx: 2, minX: 1400, maxX: 1800, type: 'patrol' }
        ]
    },
    {   // Map 4: Thủy Cung Giam Giữ
        key: { x: 1100, y: 350, collected: false }, door: { x: 2000, y: 260, win: false },
        platforms: [
            { x: 0, y: 300, width: 300, height: 40 },
            { x: 500, y: 500, width: 800, height: 40 },
            { x: 1500, y: 500, width: 800, height: 40, type: 'honey' },
            { x: 1900, y: 340, width: 300, height: 40 }
        ],
        water: [{ x: 400, y: 250, width: 1000, height: 350 }]
    },
    {   // Map 5: Cú Nhảy Cuối Cùng & Chồng Người Nhảy Lò Xo
        key: { x: 1300, y: 150, collected: false }, door: { x: 2400, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 500, height: 60 },
            { x: 800, y: 440, width: 100, height: 60, type: 'bounce' },
            { x: 1200, y: 200, width: 300, height: 20 },
            { x: 1800, y: 440, width: 800, height: 60 }
        ],
        lava: [{ x: 500, y: 550, width: 1300, height: 50 }]
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
            players[id].y = 100; 
        });
    }
    io.emit('currentPlayers', players);
    io.emit('gameState', gameState);
}

// SERVER LOOP UPDATE 60FPS
setInterval(() => {
    if (gameState.gameFinished || !gameState.enemies) return;
    
    // Cập nhật quái vật đi tuần tra (patrol)
    gameState.enemies.forEach(enemy => {
        if (enemy.type === 'patrol') {
            enemy.x += enemy.vx;
            if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) {
                enemy.vx *= -1; // Đụng giới hạn thì quay đầu
            }
        }
    });
    io.emit('updateDynamicObjects', { enemies: gameState.enemies });
}, 16.66);

io.on('connection', (socket) => {
    players[socket.id] = {
        id: socket.id, x: 50, y: 100, facing: 'right',
        color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'][Object.keys(players).length % 7]
    };
    
    // Gửi ID cho client để xác nhận
    socket.emit('initId', socket.id);

    if (Object.keys(players).length === 1) initLevel(0);
    
    socket.emit('currentPlayers', players);
    socket.emit('gameState', gameState);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x; 
            players[socket.id].y = data.y; 
            players[socket.id].facing = data.facing;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('teamDied', () => { initLevel(currentLevelIndex); });
    
    socket.on('updateGameState', (updatedState) => {
        if (updatedState.door && updatedState.door.win) { initLevel(currentLevelIndex + 1); }
        else { gameState.key = updatedState.key || gameState.key; io.emit('gameState', gameState); }
    });

    socket.on('disconnect', () => { 
        delete players[socket.id]; 
        io.emit('playerDisconnected', socket.id); 
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server Pico Park chạy tại port ${PORT}`));
