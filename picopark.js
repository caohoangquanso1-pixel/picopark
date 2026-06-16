const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let currentLevelIndex = 0;
let isTransitioning = false; // Biến khóa bảo vệ trạng thái chuyển màn từ Server
const MAP_WIDTH = 3000; 

const levels = [
    {   // Map 1: Phối Hợp Nút Bấm Thần Tốc (Đã tích hợp Gate Co-op mới)
        spawn: { x: 50, y: 100 },
        key: { x: 900, y: 350, collected: false }, door: { x: 1800, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 600, height: 60 },
            { x: 640, y: 440, width: 1400, height: 60 }
        ],
        buttons: [
            { id: 'btn_m1_left', x: 350, y: 425, width: 40, height: 15, pressed: false, gateId: 1 },
            { id: 'btn_m1_right', x: 750, y: 425, width: 40, height: 15, pressed: false, gateId: 1 }
        ],
        gates: [
            { id: 1, x: 600, y: 200, width: 40, height: 240, open: false }
        ],
        spikes: []
    },
    {   // Map 2: Băng Chuyền Trượt Ngã
        spawn: { x: 50, y: 100 },
        key: { x: 1200, y: 350, collected: false }, door: { x: 2200, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 400, y: 440, width: 500, height: 60, type: 'conveyorRight' },
            { x: 1000, y: 440, width: 400, height: 60 },
            { x: 1500, y: 440, width: 1000, height: 60 }
        ],
        spikes: [{ x: 900, y: 550, width: 100, height: 50 }, { x: 1400, y: 550, width: 100, height: 50 }]
    },
    {   // Map 3: Khám Phá Cổng Dịch Chuyển
        spawn: { x: 50, y: 100 },
        key: { x: 1400, y: 150, collected: false }, door: { x: 2400, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 600, height: 60 },
            { x: 800, y: 200, width: 200, height: 20 },
            { x: 1300, y: 200, width: 200, height: 20 },
            { x: 1900, y: 440, width: 600, height: 60 }
        ],
        portals: [{ x1: 500, y1: 360, x2: 850, y2: 120 }],
        lava: [{ x: 600, y: 550, width: 1300, height: 50 }]
    },
    {   // Map 4: Sàn Băng & Cú Nhảy Lò Xo
        spawn: { x: 50, y: 100 },
        key: { x: 1300, y: 150, collected: false }, door: { x: 2500, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 400, y: 440, width: 400, height: 60, type: 'ice' },
            { x: 900, y: 440, width: 100, height: 60, type: 'bounce' },
            { x: 1200, y: 200, width: 300, height: 20 },
            { x: 1800, y: 440, width: 800, height: 60 }
        ],
        lava: [{ x: 300, y: 550, width: 1500, height: 50 }]
    },
    {   // Map 5: Xưởng Máy Cưa Điên Loạn
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
            { x: 1200, y: 410, radius: 30, vx: 4, minX: 1000, maxX: 1700 },
            { x: 2200, y: 410, radius: 30, vx: 5, minX: 2000, maxX: 2500 }
        ]
    },
    {   // Map 6: Thủy Cung Dưỡng Khí
        spawn: { x: 50, y: 200 },
        key: { x: 1200, y: 350, collected: false }, door: { x: 2300, y: 260, win: false },
        platforms: [
            { x: 0, y: 300, width: 300, height: 40 },
            { x: 500, y: 500, width: 1200, height: 40 },
            { x: 1900, y: 340, width: 500, height: 40 }
        ],
        water: [{ x: 400, y: 200, width: 1400, height: 400 }],
        enemies: [{ id: 1, x: 1000, y: 468, width: 32, height: 32, vx: 2, minX: 800, maxX: 1400, type: 'patrol' }]
    },
    {   // Map 7: Mật Ong Dính Chân & Cửa Chốt Đuôi
        spawn: { x: 50, y: 100 },
        key: { x: 1600, y: 150, collected: false }, door: { x: 2500, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 700, y: 440, width: 500, height: 60, type: 'honey' },
            { x: 1400, y: 200, width: 400, height: 20 },
            { x: 1900, y: 440, width: 800, height: 60 }
        ],
        buttons: [
            { id: 'btn_m7', x: 950, y: 425, width: 40, height: 15, pressed: false, gateId: 7 }
        ],
        gates: [
            { id: 7, x: 2350, y: 360, width: 30, height: 80, open: false }
        ],
        wind: [{ x: 1200, y: 100, width: 300, height: 450, forceY: -10 }],
        lava: [{ x: 400, y: 550, width: 1500, height: 50 }]
    },
    {   // Map 8: Combo Băng Chuyền + Máy Cưa
        spawn: { x: 50, y: 100 },
        key: { x: 1400, y: 350, collected: false }, door: { x: 2500, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 400, height: 60 },
            { x: 600, y: 440, width: 1000, height: 60, type: 'conveyorLeft' },
            { x: 1800, y: 440, width: 800, height: 60 }
        ],
        spikes: [{ x: 400, y: 550, width: 200, height: 50 }, { x: 1600, y: 550, width: 200, height: 50 }],
        sawblades: [{ x: 1000, y: 410, radius: 30, vx: 6, minX: 600, maxX: 1500 }]
    },
    {   // Map 9: Ma Trận Không Gian
        spawn: { x: 50, y: 100 },
        key: { x: 1200, y: 100, collected: false }, door: { x: 2400, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 800, y: 440, width: 200, height: 60 },
            { x: 1100, y: 150, width: 300, height: 20 },
            { x: 1800, y: 440, width: 800, height: 60 }
        ],
        portals: [
            { x1: 200, y1: 360, x2: 850, y2: 360 },
            { x1: 900, y1: 360, x2: 1200, y2: 70 }
        ],
        lava: [{ x: 300, y: 550, width: 1500, height: 50 }]
    },
    {   // Map 10: Địa Ngục Tổng Hợp
        spawn: { x: 50, y: 100 },
        key: { x: 1600, y: 150, collected: false }, door: { x: 2600, y: 360, win: false },
        platforms: [
            { x: 0, y: 440, width: 300, height: 60 },
            { x: 500, y: 440, width: 200, height: 60, type: 'bounce' },
            { x: 900, y: 200, width: 300, height: 20, type: 'conveyorRight' },
            { x: 1500, y: 200, width: 200, height: 20, type: 'ice' },
            { x: 2100, y: 440, width: 600, height: 60 }
        ],
        sawblades: [{ x: 1050, y: 170, radius: 25, vx: 3, minX: 900, maxX: 1200 }],
        wind: [{ x: 1800, y: 200, width: 200, height: 400, forceX: 5 }],
        lava: [{ x: 300, y: 550, width: 1800, height: 50 }]
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
            buttons: lvl.buttons || [], gates: lvl.gates || [],
            gameFinished: false
        };
        let spawnP = lvl.spawn || {x: 50, y: 100};
        Object.keys(players).forEach((id, i) => {
            players[id].x = spawnP.x + (i * 15);
            players[id].y = spawnP.y; 
            players[id].vx = 0; players[id].vy = 0;
        });
    }
    io.emit('currentPlayers', players);
    io.emit('gameState', gameState);
}

// SERVER LOOP UPDATE 60FPS
setInterval(() => {
    if (gameState.gameFinished) return;
    
    if (gameState.enemies) {
        gameState.enemies.forEach(enemy => {
            if (enemy.type === 'patrol') {
                enemy.x += enemy.vx;
                if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) enemy.vx *= -1;
            }
        });
    }
    
    if (gameState.sawblades) {
        gameState.sawblades.forEach(saw => {
            saw.x += saw.vx;
            if (saw.x <= saw.minX || saw.x >= saw.maxX) saw.vx *= -1;
        });
    }

    // XỬ LÝ VẬT LÝ NÚT BẤM VÀ CỬA SẬP CO-OP TRÊN SERVER
    if (gameState.buttons && gameState.gates) {
        gameState.buttons.forEach(btn => {
            let anyPlayerOnBtn = false;
            Object.values(players).forEach(p => {
                let pw = p.width || 32; let ph = p.height || 40;
                // Check va chạm người chơi đứng đè lên nút
                if (p.x < btn.x + btn.width && p.x + pw > btn.x &&
                    p.y < btn.y + btn.height && p.y + ph > btn.y - 6) {
                    anyPlayerOnBtn = true;
                }
            });
            btn.pressed = anyPlayerOnBtn;
        });

        // Cập nhật trạng thái mở của Gate nếu bất kỳ nút tương ứng nào được bấm
        gameState.gates.forEach(gate => {
            let shouldOpen = false;
            gameState.buttons.forEach(btn => {
                if (btn.gateId === gate.id && btn.pressed) shouldOpen = true;
            });
            gate.open = shouldOpen;
        });
    }
    
    io.emit('updateDynamicObjects', { 
        enemies: gameState.enemies, 
        sawblades: gameState.sawblades,
        buttons: gameState.buttons,
        gates: gameState.gates
    });
}, 16.66);

io.on('connection', (socket) => {
    let spawnP = levels[currentLevelIndex] ? levels[currentLevelIndex].spawn : {x: 50, y: 100};
    players[socket.id] = {
        id: socket.id, x: spawnP.x, y: spawnP.y, 
        width: 32, height: 40, facing: 'right',
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

    socket.on('teamDied', () => { 
        if(!isTransitioning) initLevel(currentLevelIndex); 
    });
    
    socket.on('updateGameState', (updatedState) => {
        // Chặn tuyệt đối nếu lệch màn hình hiện tại hoặc đang trong quá trình load màn mới
        if (updatedState.levelIndex !== currentLevelIndex || isTransitioning) return;

        if (updatedState.door && updatedState.door.win && !gameState.door.win) { 
            gameState.door.win = true; 
            io.emit('gameState', gameState); // Đồng bộ cho mọi máy hiển thị màu xanh lá (Win)
            
            isTransitioning = true; // Khóa nhận sự kiện
            
            // ĐỢI 1.5 GIÂY CHO CÁC MÁY CÙNG XEM HIỆU ỨNG RỒI MỚI CHUYỂN LEVEL
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
http.listen(PORT, () => console.log(`Server Pico Park chay tai port ${PORT}`));
