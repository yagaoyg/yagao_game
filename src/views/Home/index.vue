<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRafFn } from '@vueuse/core'
import gsap from 'gsap'

// 游戏状态
const gameStarted = ref(false)
const gameOver = ref(false)
const score = ref(0)
const level = ref(1)

// 画布相关
const canvasRef = ref(null)
const ctx = ref(null)
const width = ref(1600)
const height = ref(900)

// 玩家相关
const player = ref({
  x: 400,
  y: 300,
  radius: 20,
  speed: 3,
  direction: { x: 0, y: 0 },
  health: 100,
  exp: 0
})

// 敌人数组
const enemies = ref([])
// 技能数组
const projectiles = ref([])

// 键盘控制
const keys = ref({
  w: false,
  s: false,
  a: false,
  d: false
})

// 初始化游戏
const initGame = () => {
  gameStarted.value = true
  gameOver.value = false
  score.value = 0
  level.value = 1
  player.value = {
    x: width.value / 2,
    y: height.value / 2,
    radius: 20,
    speed: 5,
    direction: { x: 0, y: 0 },
    health: 100,
    exp: 0
  }
  enemies.value = []
  projectiles.value = []
}

// 敌人刷新间隔和生命值随等级和时间提升
let baseEnemyInterval = 2000
let enemySpawnInterval
let enemySpawnTimer = null
let gameTime = ref(0)

function getEnemyInterval() {
  // 难度提升：每升一级减少100ms，最低500ms，随时间每30秒再减少100ms
  const levelReduce = (level.value - 1) * 100
  const timeReduce = Math.floor(gameTime.value / 30) * 100
  return Math.max(500, baseEnemyInterval - levelReduce - timeReduce)
}

function getEnemyHp() {
  // 难度提升：基础20+等级*10+每30秒*10
  return 20 + level.value * 10 + Math.floor(gameTime.value / 30) * 10
}

// 生成敌人
const spawnEnemy = () => {
  const radius = 15
  let x, y
  if (Math.random() < 0.5) {
    x = Math.random() < 0.5 ? 0 - radius : width.value + radius
    y = Math.random() * height.value
  } else {
    x = Math.random() * width.value
    y = Math.random() < 0.5 ? 0 - radius : height.value + radius
  }
  enemies.value.push({
    x,
    y,
    radius,
    speed: 1,
    color: 'red',
    alive: true,
    hp: getEnemyHp()
  })
}

// 自动射击武器系统
let shootInterval
const projectileSpeed = 6
const projectileRadius = 6
const projectileDamage = 20
const shootProjectile = () => {
  if (!gameStarted.value || gameOver.value || pendingUpgrade.value) return
  if (enemies.value.length === 0) return
  // 寻找最近的敌人
  let minDist = Infinity
  let target = null
  enemies.value.forEach(enemy => {
    if (!enemy.alive) return
    const dist = Math.hypot(player.value.x - enemy.x, player.value.y - enemy.y)
    if (dist < minDist) {
      minDist = dist
      target = enemy
    }
  })
  if (!target) return
  // 多弹道
  const shots = playerUpgrades.value.multiShot
  const baseAngle = Math.atan2(target.y - player.value.y, target.x - player.value.x)
  const spread = Math.PI / 12 // 15度
  for (let i = 0; i < shots; i++) {
    const angle = baseAngle + (i - (shots - 1) / 2) * spread
    projectiles.value.push({
      x: player.value.x,
      y: player.value.y,
      radius: projectileRadius,
      speed: projectileSpeed,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      damage: playerUpgrades.value.damage,
      special: playerUpgrades.value.special
    })
  }
}

// 更新游戏状态
const updateGame = () => {
  if (!gameStarted.value || gameOver.value) return

  // 更新玩家位置
  if (keys.value.w) player.value.y -= player.value.speed
  if (keys.value.s) player.value.y += player.value.speed
  if (keys.value.a) player.value.x -= player.value.speed
  if (keys.value.d) player.value.x += player.value.speed

  // 限制玩家移动范围
  player.value.x = Math.max(player.value.radius, Math.min(width.value - player.value.radius, player.value.x))
  player.value.y = Math.max(player.value.radius, Math.min(height.value - player.value.radius, player.value.y))

  // 更新敌人位置
  enemies.value.forEach(enemy => {
    if (!enemy.alive) return
    const angle = Math.atan2(player.value.y - enemy.y, player.value.x - enemy.x)
    enemy.x += Math.cos(angle) * enemy.speed
    enemy.y += Math.sin(angle) * enemy.speed

    // 检测碰撞
    const dist = Math.hypot(player.value.x - enemy.x, player.value.y - enemy.y)
    if (dist - enemy.radius - player.value.radius < 1) {
      player.value.health -= 10
      if (player.value.health <= 0) {
        gameOver.value = true
      }
    }
  })

  // 更新子弹位置和碰撞
  for (let i = projectiles.value.length - 1; i >= 0; i--) {
    const proj = projectiles.value[i]
    proj.x += proj.dx * proj.speed
    proj.y += proj.dy * proj.speed
    // 超出边界移除
    if (
      proj.x < 0 || proj.x > width.value ||
      proj.y < 0 || proj.y > height.value
    ) {
      projectiles.value.splice(i, 1)
      continue
    }
    // 检查与敌人碰撞
    for (let j = 0; j < enemies.value.length; j++) {
      const enemy = enemies.value[j]
      if (!enemy.alive) continue
      const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y)
      if (dist < proj.radius + enemy.radius) {
        if (proj.special) {
          // 穿透弹道，敌人扣血但子弹不消失
          enemy.hp -= proj.damage
          if (enemy.hp <= 0) {
            enemy.alive = false
            score.value += 10
            gainExp(20)
          }
        } else {
          enemy.hp -= proj.damage
          if (enemy.hp <= 0) {
            enemy.alive = false
            score.value += 10
            gainExp(20)
          }
          projectiles.value.splice(i, 1)
          break
        }
      }
    }
  }
  // 移除死亡敌人
  enemies.value = enemies.value.filter(e => e.alive)

  // 渲染画面
  render()
}

// 渲染游戏画面
const render = () => {
  if (!ctx.value) return
  ctx.value.clearRect(0, 0, width.value, height.value)
  // 绘制玩家
  ctx.value.beginPath()
  ctx.value.arc(player.value.x, player.value.y, player.value.radius, 0, Math.PI * 2)
  ctx.value.fillStyle = 'blue'
  ctx.value.fill()
  // 绘制敌人
  enemies.value.forEach(enemy => {
    ctx.value.beginPath()
    ctx.value.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2)
    ctx.value.fillStyle = enemy.color
    ctx.value.fill()
  })
  // 绘制子弹
  projectiles.value.forEach(proj => {
    ctx.value.beginPath()
    ctx.value.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2)
    ctx.value.fillStyle = 'yellow'
    ctx.value.fill()
  })
}

// 键盘事件处理
const handleKeyDown = (e) => {
  if (e.key === 'w') keys.value.w = true
  if (e.key === 's') keys.value.s = true
  if (e.key === 'a') keys.value.a = true
  if (e.key === 'd') keys.value.d = true
}

const handleKeyUp = (e) => {
  if (e.key === 'w') keys.value.w = false
  if (e.key === 's') keys.value.s = false
  if (e.key === 'a') keys.value.a = false
  if (e.key === 'd') keys.value.d = false
}

// 游戏循环
function resetEnemySpawnTimer() {
  if (enemySpawnTimer) clearInterval(enemySpawnTimer)
  enemySpawnTimer = setInterval(spawnEnemy, getEnemyInterval())
}

const { pause, resume } = useRafFn(() => {
  updateGame()
  gameTime.value += 1 / 60
  // 每30秒重置一次出怪频率
  if (Math.floor(gameTime.value) % 30 === 0 && gameTime.value > 0) {
    resetEnemySpawnTimer()
  }
}, { immediate: false })

onMounted(() => {
  ctx.value = canvasRef.value.getContext('2d')
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  initGame()
  resume()
  gameTime.value = 0
  resetEnemySpawnTimer()
  shootInterval = setInterval(shootProjectile, playerUpgrades.value.fireRate)
})

// 升级相关
const expToLevel = level => 50 + (level - 1) * 30
const upgradeOptions = [
  { key: 'fireRate', label: '射速加快', desc: '子弹发射更快' },
  { key: 'damage', label: '伤害提高', desc: '子弹伤害提升' },
  { key: 'multiShot', label: '增加弹道', desc: '每次发射多一颗子弹' },
  { key: 'special', label: '特殊子弹', desc: '子弹带穿透效果' }
]
const showUpgrade = ref(false)
const upgradeChoices = ref([])
const pendingUpgrade = ref(false)
const playerUpgrades = ref({
  fireRate: 400,
  damage: 20,
  multiShot: 1,
  special: false
})

// 经验与升级
function gainExp(amount) {
  player.value.exp += amount
  if (player.value.exp >= expToLevel(level.value)) {
    player.value.exp -= expToLevel(level.value)
    level.value++
    pause()
    showUpgrade.value = true
    pendingUpgrade.value = true
    // 随机3个升级项
    let pool = [...upgradeOptions]
    upgradeChoices.value = []
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      upgradeChoices.value.push(pool[idx])
      pool.splice(idx, 1)
    }
    // 升级时重置出怪频率
    resetEnemySpawnTimer()
  }
}

function chooseUpgrade(opt) {
  if (opt.key === 'fireRate') {
    playerUpgrades.value.fireRate = Math.max(100, playerUpgrades.value.fireRate - 60)
  } else if (opt.key === 'damage') {
    playerUpgrades.value.damage += 10
  } else if (opt.key === 'multiShot') {
    playerUpgrades.value.multiShot = Math.min(7, playerUpgrades.value.multiShot + 1)
  } else if (opt.key === 'special') {
    playerUpgrades.value.special = true
  }
  showUpgrade.value = false
  pendingUpgrade.value = false
  resume()
}

// --- watch 语句必须放在所有变量和函数定义之后 ---
watch(() => playerUpgrades.value.fireRate, (val) => {
  clearInterval(shootInterval)
  shootInterval = setInterval(shootProjectile, val)
})
</script>

<template>
  <div class="game-container">
    <div class="hud">
      <div class="health">生命值: {{ player.health }}</div>
      <div class="score">分数: {{ score }}</div>
      <div class="level">等级: {{ level }}</div>
      <div class="exp">经验: {{ player.exp }} / {{ expToLevel(level) }}</div>
    </div>
    <canvas ref="canvasRef" :width="width" :height="height" class="game-canvas"></canvas>
    <div v-if="gameOver" class="game-over">
      <h2>游戏结束</h2>
      <p>最终分数: {{ score }}</p>
      <button @click="initGame">重新开始</button>
    </div>
    <div v-if="showUpgrade" class="upgrade-modal">
      <h2>升级！请选择一项</h2>
      <div class="upgrade-list">
        <button v-for="opt in upgradeChoices" :key="opt.key" @click="chooseUpgrade(opt)">
          <strong>{{ opt.label }}</strong>
          <div>{{ opt.desc }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.game-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.hud {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1;
  color: white;
  font-size: 18px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);

  >div {
    margin-bottom: 10px;
  }
}

.game-canvas {
  background: #000;
  border-radius: 8px;
}

.game-over {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 8px;
  color: white;
  text-align: center;

  button {
    margin-top: 20px;
    padding: 10px 20px;
    font-size: 16px;
    background: #4CAF50;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;

    &:hover {
      background: #45a049;
    }
  }
}

.upgrade-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #222;
  color: #fff;
  padding: 32px 24px;
  border-radius: 12px;
  box-shadow: 0 4px 24px #000a;
  z-index: 10;
  text-align: center;
  min-width: 320px;

  h2 {
    margin-bottom: 20px;
  }

  .upgrade-list {
    display: flex;
    gap: 16px;
    justify-content: center;

    button {
      background: #444;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 16px 12px;
      min-width: 100px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #4CAF50;
      }

      strong {
        font-size: 18px;
      }

      div {
        font-size: 14px;
        margin-top: 8px;
      }
    }
  }
}
</style>