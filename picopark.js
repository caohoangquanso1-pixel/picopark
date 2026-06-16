const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentLevelIndex = 0;
const MAP_WIDTH = 3000; 

// HỆ THỐNG MAP ĐÃ THÊM TÍNH NĂNG MỚI (Băng chuyền, Cổng dịch chuyển, Lưỡi cưa)
const levels = [
    {   // Map 1: Làm quen & Băng chuyền đẩy
        spawn: { x: 50, y: 100 },
        key: { x: 1200, y: 350, collected: false }, door: { x: 2200, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 400, y: 440, width: 500, height: 60, type: 'conveyorRight' }, // Băng chuyền đẩy sang phải
            { x: 1000, y: 440, width: 400, height: 60 },
            { x: 1400, y: 250, width: 40, height: 250 }, // Tường chắn
            { x: 1440, y: 440, width: 1000, height: 60 }
        ],
        spikes: [{ x: 900, y: 550, width: 100, height: 50 }]
    },
    {   // Map 2: Cổng Dịch Chuyển & Kẻ Thù Đi Tuần
        spawn: { x: 50, y: 100 },
        key: { x: 1400, y: 150, collected: false }, door: { x: 2400, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 600, height: 60 },
            { x: 800, y: 200, width: 200, height: 20 },
            { x: 1300, y: 200, width: 200, height: 20 },
            { x: 1900, y: 440, width: 600, height: 60 }
        ],
        portals: [
            { x1: 500, y1: 360, x2: 850, y2: 120 } // Vào cổng tím ở dưới sẽ ra cổng vàng ở trên
        ],
        lava: [{ x: 600, y: 550, width: 1300, height: 50 }],
        enemies: [{ id: 1, x: 2000, y: 408, width: 32, height: 32, vx: 3, minX: 1900, maxX: 2300, type: 'patrol' }]
    },
    {   // Map 3: Xưởng Lưỡi Cưa Chết Chóc (1 người chết = All chết)
        spawn: { x: 50, y: 100 },
        key: { x: 1500, y: 350, collected: false }, door: { x: 2600, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 500, y: 440, width: 300, height: 60 },
            { x: 1000, y: 440, width: 800, height: 60 },
            { x: 2000, y: 440, width: 800, height: 60 }
        ],
        spikes: [{ x: 0, y: 550, width: 3000, height: 50 }],
        sawblades: [
            { x: 1200, y: 410, radius: 30, vx: 4, minX: 1000, maxX: 1700 } // Lưỡi cưa xoay cực nhanh
        ]
    },
    {   // Map 4: Băng chuyền ngược & Quạt gió
        spawn: { x: 50, y: 300 },
        key: { x: 1400, y: 150, collected: false }, door: { x: 2000, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 500, height: 60 },
            { x: 700, y: 440, width: 600, height: 60, type: 'conveyorLeft' }, // Đẩy ngược lại
            { x: 1600, y: 440, width: 600, height: 60 }
        ],
        wind: [{ x: 1200, y: 150, width: 300, height: 400, forceY: -9 }],
        lava: [{ x: 500, y: 550, width: 200, height: 50 }, { x: 1300, y: 550, width: 300, height: 50 }]
    },
    {   // Map 5: Ma Trận Tổng Hợp
        spawn: { x: 50, y: 100 },
        key: { x: 1500, y: 100, collected: false }, door: { x: 2500, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 500, y: 440, width: 300, height: 60, type: 'bounce' },
            { x: 1000, y: 200, width: 200, height: 60, type: 'conveyorRight' },
            { x: 1400, y: 150, width: 200, height: 20 },
            { x: 2000, y: 440, width: 800, height: 60 }
        ],
        portals: [{ x1: 250, y1: 360, x2: 1050, y2: 100 }],
        sawblades: [{ x: 2100, y: 410, radius: 30, vx: 5, minX: 2000, maxX: 2400 }],
        lava: [{ x: 300, y: 550, width: 1700, height: 50 }]
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
            sawblades: lvl.sawblades || [], portals: lvl.portals || [],
            gameFinished: false
        };
        // Reset toàn bộ người chơi về đúng spawn của map hiện tại
        let spawnP = lvl.spawn || {x: 50, y: 100};
        Object.keys(players).forEach((id, i) => {
            players[id].x = spawnP.x + (i * 10);
            players[id].y = spawnP.y; 
        });
    }
    io.emit('currentPlayers', players);
    io.emit('gameState', gameState);
}

// SERVER LOOP UPDATE 60FPS
setInterval(() => {
    if (gameState.gameFinished) return;
    
    // Cập nhật quái vật
    if (gameState.enemies) {
        gameState.enemies.forEach(enemy => {
            if (enemy.type === 'patrol') {
                enemy.x += enemy.vx;
                if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) enemy.vx *= -1;
            }
        });
    }
    
    // Cập nhật lưỡi cưa
    if (gameState.sawblades) {
        gameState.sawblades.forEach(saw => {
            saw.x += saw.vx;
            if (saw.x <= saw.minX || saw.x >= saw.maxX) saw.vx *= -1;
        });
    }
    
    io.emit('updateDynamicObjects', { enemies: gameState.enemies, sawblades: gameState.sawblades });
}, 16.66);

io.on('connection', (socket) => {
    // FIX LỖI TÀNG HÌNH: Đã thêm width và height vào data của người chơi mới
    let spawnP = levels[currentLevelIndex] ? levels[currentLevelIndex].spawn : {x: 50, y: 100};
    players[socket.id] = {
        id: socket.id, 
        x: spawnP.x, y: spawnP.y, 
        width: 32, height: 40, // ĐÂY LÀ THÔNG SỐ GIÚP NHÂN VẬT KHÔNG BỊ TÀNG HÌNH
        facing: 'right',
        color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'][Object.keys(players).length % 7]
    };
    
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
