const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentLevelIndex = 0;
let isTransitioning = false; // Chốt chặn chống nhảy màn dồn dập khi multi-touch
const MAP_WIDTH = 3000; 

// THIẾT KẾ 10 MAP HOÀN TOÀN MỚI: Khoảng cách ô nhảy chuẩn 120px-140px cực kỳ vừa vặn!
const levels = [
    {   // Map 1: Bước Nhảy Hoàn Hảo (Khoảng cách kịch tính vừa vặn)
        spawn: { x: 50, y: 100 },
        key: { x: 800, y: 350, collected: false }, door: { x: 1400, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 500, height: 60 },
            { x: 630, y: 440, width: 400, height: 60 }, // khoảng trống đúng 130px vượt hố an toàn
            { x: 1160, y: 440, width: 600, height: 60 }  // khoảng trống đúng 130px vượt hố an toàn
        ],
        spikes: []
    },
    {   // Map 2: Băng Chuyền Tốc Độ
        spawn: { x: 50, y: 100 },
        key: { x: 1000, y: 350, collected: false }, door: { x: 1800, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 530, y: 440, width: 350, height: 60, type: 'conveyorRight' },
            { x: 1010, y: 440, width: 300, height: 60 },
            { x: 1440, y: 440, width: 600, height: 60 }
        ],
        spikes: [{ x: 410, y: 550, width: 100, height: 50 }]
    },
    {   // Map 3: Đột Phá Không Trọng Lực 🌌 (SÁNG TẠO MỚI)
        spawn: { x: 50, y: 100 },
        key: { x: 850, y: 120, collected: false }, door: { x: 1500, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 800, y: 220, width: 150, height: 30 }, // lửng lơ trên không
            { x: 1300, y: 440, width: 500, height: 60 }
        ],
        zeroGravity: [{ x: 400, y: 50, width: 400, height: 500 }] // Vùng bay lượn kết nối 2 bờ hố sâu!
    },
    {   // Map 4: Sàn Băng Đàn Hồi
        spawn: { x: 50, y: 100 },
        key: { x: 1100, y: 150, collected: false }, door: { x: 1700, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 430, y: 440, width: 300, height: 60, type: 'ice' },
            { x: 860, y: 440, width: 100, height: 60, type: 'bounce' },
            { x: 1050, y: 260, width: 200, height: 20 },
            { x: 1380, y: 440, width: 600, height: 60 }
        ],
        lava: [{ x: 300, y: 550, width: 1100, height: 50 }]
    },
    {   // Map 5: Ma Trận Bay Lượn & Cưa Máy 🌌
        spawn: { x: 50, y: 100 },
        key: { x: 1200, y: 100, collected: false }, door: { x: 1800, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 1100, y: 200, width: 250, height: 30 },
            { x: 1600, y: 440, width: 500, height: 60 }
        ],
        zeroGravity: [{ x: 400, y: 50, width: 700, height: 500 }],
        sawblades: [{ x: 650, y: 250, radius: 30, vx: 3, minX: 450, maxX: 850 }]
    },
    {   // Map 6: Thủy Cung Dưỡng Khí
        spawn: { x: 50, y: 200 },
        key: { x: 1100, y: 350, collected: false }, door: { x: 1900, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 430, y: 500, width: 1000, height: 40 },
            { x: 1560, y: 440, width: 500, height: 60 }
        ],
        water: [{ x: 430, y: 200, width: 1000, height: 310 }]
    },
    {   // Map 7: Hố Dung Nham Không Trọng Lực 🌌
        spawn: { x: 50, y: 100 },
        key: { x: 950, y: 150, collected: false }, door: { x: 1700, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 900, y: 280, width: 150, height: 30 },
            { x: 1400, y: 440, width: 500, height: 60 }
        ],
        zeroGravity: [{ x: 300, y: 50, width: 1100, height: 400 }],
        lava: [{ x: 300, y: 550, width: 1100, height: 50 }]
    },
    {   // Map 8: Đường Băng Chuyền Ngược
        spawn: { x: 50, y: 100 },
        key: { x: 900, y: 350, collected: false }, door: { x: 1600, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 430, y: 440, width: 800, height: 60, type: 'conveyorLeft' },
            { x: 1360, y: 440, width: 500, height: 60 }
        ],
        sawblades: [{ x: 800, y: 410, radius: 25, vx: 4, minX: 500, maxX: 1100 }]
    },
    {   // Map 9: Ma Trận Cổng Dịch Chuyển Sinh Tử
        spawn: { x: 50, y: 100 },
        key: { x: 950, y: 100, collected: false }, door: { x: 1600, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 430, y: 440, width: 300, height: 60 },
            { x: 850, y: 180, width: 200, height: 20 },
            { x: 1300, y: 440, width: 500, height: 60 }
        ],
        portals: [
            { x1: 200, y1: 360, x2: 500, y2: 360 },
            { x1: 600, y1: 360, x2: 900, y2: 100 }
        ]
    },
    {   // Map 10: Tầng Địa Ngục Cuối Cùng (Zero-G Tổng Hợp) 🌌
        spawn: { x: 50, y: 100 },
        key: { x: 1100, y: 100, collected: false }, door: { x: 1900, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 430, y: 440, width: 200, height: 60, type: 'bounce' },
            { x: 1000, y: 200, width: 300, height: 20, type: 'ice' },
            { x: 1500, y: 440, width: 600, height: 60 }
        ],
        zeroGravity: [{ x: 630, y: 50, width: 370, height: 500 }],
        lava: [{ x: 300, y: 550, width: 1200, height: 50 }]
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
            zeroGravity: lvl.zeroGravity || [],
            gameFinished: false
        };
        let spawnP = lvl.spawn || {x: 50, y: 100};
        Object.keys(players).forEach((id, i) => {
            players[id].x = spawnP.x + (i * 10);
            players[id].y = spawnP.y; 
            players[id].vx = 0; players[id].vy = 0;
        });
    }
    io.emit('currentPlayers', players);
    io.emit('gameState', gameState);
}

setInterval(() => {
    if (gameState.gameFinished) return;
    if (gameState.enemies) {
        gameState.enemies.forEach(enemy => {
            if (enemy.type === 'patrol') { enemy.x += enemy.vx; if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) enemy.vx *= -1; }
        });
    }
    if (gameState.sawblades) {
        gameState.sawblades.forEach(saw => { saw.x += saw.vx; if (saw.x <= saw.minX || saw.x >= saw.maxX) saw.vx *= -1; });
    }
    io.emit('updateDynamicObjects', { enemies: gameState.enemies, sawblades: gameState.sawblades });
}, 16.66);

io.on('connection', (socket) => {
    let spawnP = levels[currentLevelIndex] ? levels[currentLevelIndex].spawn : {x: 50, y: 100};
    players[socket.id] = {
        id: socket.id, x: spawnP.x, y: spawnP.y, width: 32, height: 40, facing: 'right',
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

    socket.on('teamDied', () => { if (!isTransitioning) initLevel(currentLevelIndex); });
    
    socket.on('updateGameState', (updatedState) => {
        if (updatedState.levelIndex !== currentLevelIndex || isTransitioning) return;

        if (updatedState.door && updatedState.door.win && !gameState.door.win) { 
            gameState.door.win = true; 
            io.emit('gameState', gameState); // Thông báo cho tất cả client đổi màu cửa ăn mừng thắp sáng thành công
            
            isTransitioning = true;
            // SỬ DỤNG SETTIMEOUT ĐỂ TỪ TỪ QUA MÀN SAU 1.5 GIÂY ĐÚNG Ý BẠN 🥂
            setTimeout(() => {
                isTransitioning = false;
                initLevel(currentLevelIndex + 1); 
            }, 1500);
        }
        else if (updatedState.key) { 
            gameState.key = updatedState.key; 
            io.emit('gameState', gameState); 
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('playerDisconnected', socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server Pico Park mượt mà đang chạy tại port ${PORT}`));
