/**
 * QR Code Generator for WeChat Mini Program
 * 实现 QR 码的生成和 canvas 2d 绘制
 * 基于 QR Code 标准（ISO/IEC 18004），支持版本 1-10，纠错级别 L
 */

// ===================== QR 码核心实现 =====================

// 纠错级别: L(7%), M(15%), Q(25%), H(30%)
const EC_LEVEL = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3
}

// 各版本的符号尺寸（模块数）
const VERSION_SIZES = [
  0, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97
]

// 各版本各纠错级别的纠错码字数
const EC_CODEWORDS_PER_BLOCK = [
  // Version 1-10, EC Level L
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  // Version 1-10, EC Level M
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  // Version 1-10, EC Level Q
  [0, 13, 22, 18, 26, 18, 24, 18, 20, 24, 30],
  // Version 1-10, EC Level H
  [0, 17, 28, 22, 16, 24, 28, 26, 26, 26, 28]
]

// 各版本的数据码字数
const DATA_CODEWORDS = [
  // Version 1-10, EC Level L
  [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274],
  // Version 1-10, EC Level M
  [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216],
  // Version 1-10, EC Level Q
  [0, 13, 22, 34, 48, 62, 76, 88, 110, 132, 154],
  // Version 1-10, EC Level H
  [0, 9, 16, 26, 38, 46, 60, 66, 86, 100, 122]
]

// 各版本的分块信息 [总块数, 数据块数, 每个数据块的EC码字数, 每个数据块的数据码字数, 剩余EC块数, 剩余块的数据码字数]
const BLOCK_INFO = [
  // Version 1-10, EC Level L
  [[0,0,0,0,0,0],[1,1,7,19,0,0],[1,1,10,34,0,0],[1,2,15,55,0,0],[1,2,20,80,0,0],[1,4,26,108,0,0],[2,4,18,136,0,0],[2,2,20,156,2,158],[2,4,24,194,2,196],[2,6,30,232,2,234],[4,4,18,274,1,276]],
  // Version 1-10, EC Level M
  [[0,0,0,0,0,0],[1,1,10,16,0,0],[1,1,16,28,0,0],[1,2,26,44,0,0],[2,2,18,64,0,0],[2,4,24,86,0,0],[4,4,16,108,0,0],[4,4,20,124,1,126],[2,6,22,154,2,156],[4,6,22,182,2,184],[4,8,22,216,2,218]],
  // Version 1-10, EC Level Q
  [[0,0,0,0,0,0],[1,1,13,13,0,0],[1,1,22,22,0,0],[1,2,18,34,0,0],[2,4,26,48,0,0],[2,4,18,62,2,64],[4,4,24,76,2,78],[4,6,18,88,2,90],[6,6,20,110,2,112],[6,8,24,132,4,134],[6,10,20,154,4,156]],
  // Version 1-10, EC Level H
  [[0,0,0,0,0,0],[1,1,17,9,0,0],[1,1,28,16,0,0],[1,2,22,26,0,0],[2,4,16,38,0,0],[4,4,22,46,2,48],[4,6,20,60,2,62],[6,6,24,66,4,68],[6,8,18,86,4,88],[6,10,20,100,6,102],[6,12,24,122,6,124]]
]

// 格式信息位
const FORMAT_INFO_BITS = [
  0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0, 0x77C4, 0x72F3,
  0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976, 0x1689, 0x13BE, 0x1CE7, 0x19D0,
  0x0762, 0x0255, 0x0D0C, 0x083B, 0x355F, 0x3068, 0x3F31, 0x3A06, 0x24B4, 0x2183,
  0x2EDA, 0x2BED, 0x0C3E, 0x0909, 0x0650, 0x0367, 0x1DD5, 0x18E2, 0x17BB, 0x128C,
  0x2FE8, 0x2ADF, 0x2586, 0x20B1, 0x3E03, 0x3B34, 0x346D, 0x315A, 0x4EAE, 0x4B99,
  0x44C0, 0x41F7, 0x5F45, 0x5A72, 0x552B, 0x501C, 0x6D78, 0x684F, 0x6716, 0x6221,
  0x7C93, 0x79A4, 0x76FD, 0x73CA, 0x96B5, 0x9382, 0x9CD9, 0x99EE, 0x875C, 0x826B,
  0x8D32, 0x8805, 0xB561, 0xB056, 0xBF0F, 0xBA38, 0xA48A, 0xA1BD, 0xAEE4, 0xABD3,
  0xD427, 0xD110, 0xDE49, 0xDB7E, 0xC5CC, 0xC0FB, 0xCFA2, 0xCA95, 0xF7F1, 0xF2C6,
  0xFD9F, 0xF8A8, 0xE61A, 0xE32D, 0xEC74, 0xE943, 0x76C4, 0x73F3, 0x7CAA, 0x799D,
  0x672F, 0x6218, 0x6D41, 0x6876, 0x5512, 0x5025, 0x5F7C, 0x5A4B, 0x44F9, 0x41CE,
  0x4E97, 0x4BA0, 0x27A4, 0x2293, 0x2DCA, 0x28FD, 0x364F, 0x3378, 0x3C21, 0x3916,
  0x0472, 0x0145, 0x0E1C, 0x0B2B, 0x1599, 0x10AE, 0x1FF7, 0x1AC0, 0x6763, 0x6254,
  0x6D0D, 0x683A, 0x7688, 0x73BF, 0x7CE6, 0x79D1, 0x44B5, 0x4182, 0x4EDB, 0x4BEC,
  0x555E, 0x5069, 0x5F30, 0x5A07, 0x2603, 0x2334, 0x2C6D, 0x295A, 0x37E8, 0x32DF,
  0x3D86, 0x38B1, 0x05D5, 0x00E2, 0x0FBB, 0x0A8C, 0x143E, 0x1109, 0x1E50, 0x1B67
]

// ===================== 数据编码 =====================

/**
 * 将文本数据编码为位流
 * @param {string} text - 输入文本
 * @param {number} version - QR码版本
 * @param {number} ecLevel - 纠错级别
 * @returns {Array} 数据位数组
 */
function encodeData(text, version, ecLevel) {
  const dataCapacity = DATA_CODEWORDS[ecLevel][version] * 8
  const bytes = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3f))
    } else {
      bytes.push(0xe0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    }
  }

  const bits = []
  // 模式指示符 (0100 = byte模式)
  bits.push(0, 1, 0, 0)

  // 字符计数位
  const countBits = version <= 9 ? 8 : 16
  const len = bytes.length
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push((len >> i) & 1)
  }

  // 数据字节
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1)
    }
  }

  // 终止符
  const termLen = Math.min(4, dataCapacity - bits.length)
  for (let i = 0; i < termLen; i++) {
    bits.push(0)
  }

  // 字节填充到字节边界
  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  // 填充字节
  const fillBytes = [0xEC, 0x11]
  let fillIdx = 0
  while (bits.length < dataCapacity) {
    const fb = fillBytes[fillIdx]
    for (let i = 7; i >= 0; i--) {
      bits.push((fb >> i) & 1)
    }
    fillIdx = (fillIdx + 1) % 2
  }

  return bits.slice(0, dataCapacity)
}

// ===================== 纠错编码 =====================

/**
 * GF(256) 有限域运算
 */
const GF256 = {
  EXP: new Array(256),
  LOG: new Array(256),

  init() {
    let x = 1
    for (let i = 0; i < 255; i++) {
      this.EXP[i] = x
      this.LOG[x] = i
      x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
    }
    this.EXP[255] = this.EXP[0]
  },

  multiply(a, b) {
    if (a === 0 || b === 0) return 0
    return this.EXP[(this.LOG[a] + this.LOG[b]) % 255]
  }
}

GF256.init()

/**
 * 计算 Reed-Solomon 纠错码字
 * @param {Array} data - 数据字节数组
 * @param {number} ecLen - 纠错码字长度
 * @returns {Array} 纠错码字数组
 */
function rsEncode(data, ecLen) {
  // 生成多项式
  let gen = [1]
  for (let i = 0; i < ecLen; i++) {
    const newGen = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      newGen[j] ^= gen[j]
      newGen[j + 1] ^= GF256.multiply(gen[j], GF256.EXP[i])
    }
    gen = newGen
  }

  const result = new Array(ecLen).fill(0)
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ result[0]
    result.shift()
    result.push(0)
    for (let j = 0; j < ecLen; j++) {
      result[j] ^= GF256.multiply(gen[j + 1], coef)
    }
  }

  return result
}

// ===================== 矩阵构建 =====================

/**
 * 创建 QR 码模块矩阵
 * @param {number} version - 版本号
 * @returns {Array} 模块矩阵（null 表示未设置）
 */
function createMatrix(version) {
  const size = VERSION_SIZES[version]
  const matrix = []
  for (let i = 0; i < size; i++) {
    matrix[i] = new Array(size).fill(null)
  }
  return matrix
}

/**
 * 放置定位图案 (Finder Pattern)
 */
function placeFinderPattern(matrix, row, col) {
  const size = matrix.length
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r
      const mc = col + c
      if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue

      const inOuter = (r >= 0 && r <= 6 && c >= 0 && c <= 6)
      const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      const isBorder = (r === 0 || r === 6 || c === 0 || c === 6)

      if (inInner || isBorder) {
        matrix[mr][mc] = { value: true, reserved: true }
      } else {
        matrix[mr][mc] = { value: false, reserved: true }
      }
    }
  }
}

/**
 * 放置对齐图案 (Alignment Pattern)
 */
function placeAlignmentPattern(matrix, centerRow, centerCol) {
  const size = matrix.length
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const mr = centerRow + r
      const mc = centerCol + c
      if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue
      if (matrix[mr][mc] && matrix[mr][mc].reserved) continue

      const isOuter = (r === -2 || r === 2 || c === -2 || c === 2)
      const isCenter = (r === 0 && c === 0)

      matrix[mr][mc] = {
        value: isOuter || isCenter,
        reserved: true
      }
    }
  }
}

/**
 * 放置时序图案 (Timing Pattern)
 */
function placeTimingPatterns(matrix) {
  const size = matrix.length
  for (let i = 8; i < size - 8; i++) {
    if (!matrix[6][i] || !matrix[6][i].reserved) {
      matrix[6][i] = { value: i % 2 === 0, reserved: true }
    }
    if (!matrix[i][6] || !matrix[i][6].reserved) {
      matrix[i][6] = { value: i % 2 === 0, reserved: true }
    }
  }
}

/**
 * 放置格式信息
 */
function placeFormatInfo(matrix, ecLevel, maskPattern) {
  const size = matrix.length
  const formatIdx = ecLevel * 8 + maskPattern
  const bits = FORMAT_INFO_BITS[formatIdx]

  // 放置第一组格式信息 (左上角)
  const positions1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ]

  // 放置第二组格式信息 (右下和左下)
  const positions2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ]

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1 === 1

    const [r1, c1] = positions1[i]
    if (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size) {
      matrix[r1][c1] = { value: bit, reserved: true }
    }

    const [r2, c2] = positions2[i]
    if (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) {
      matrix[r2][c2] = { value: bit, reserved: true }
    }
  }
}

/**
 * 放置数据位
 */
function placeDataBits(matrix, dataBits) {
  const size = matrix.length
  let bitIdx = 0

  // 从右到左的列对
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // 跳过时序图案列

    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j
        // 交替上下方向
        const upward = ((size - 1 - right) / 2) % 2 === 0
        const row = upward ? (size - 1 - vert) : vert

        if (row < 0 || row >= size || col < 0 || col >= size) continue
        if (matrix[row][col] && matrix[row][col].reserved) continue

        const bit = bitIdx < dataBits.length ? dataBits[bitIdx] === 1 : false
        matrix[row][col] = { value: bit, reserved: false }
        bitIdx++
      }
    }
  }
}

/**
 * 应用掩码图案
 */
function applyMask(matrix, maskPattern) {
  const size = matrix.length
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col] && matrix[row][col].reserved) continue

      let mask = false
      switch (maskPattern) {
        case 0: mask = (row + col) % 2 === 0; break
        case 1: mask = row % 2 === 0; break
        case 2: mask = col % 3 === 0; break
        case 3: mask = (row + col) % 3 === 0; break
        case 4: mask = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break
        case 5: mask = (row * col) % 2 + (row * col) % 3 === 0; break
        case 6: mask = ((row * col) % 2 + (row * col) % 3) % 2 === 0; break
        case 7: mask = ((row + col) % 2 + (row * col) % 3) % 2 === 0; break
      }

      if (matrix[row][col]) {
        matrix[row][col].value = matrix[row][col].value !== mask
      } else {
        matrix[row][col] = { value: mask, reserved: false }
      }
    }
  }
}

// ===================== 主入口函数 =====================

/**
 * 生成 QR 码矩阵
 * @param {string} text - 要编码的文本
 * @param {number} ecLevel - 纠错级别 (0=L, 1=M, 2=Q, 3=H)
 * @returns {Array} 二维布尔数组，true 表示黑色模块
 */
function generateQRMatrix(text, ecLevel = 0) {
  // 计算文本字节数
  const bytes = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3f))
    } else {
      bytes.push(0xe0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    }
  }
  const byteLen = bytes.length

  // 选择最小版本
  let version = 1
  for (let v = 1; v <= 10; v++) {
    const capacity = DATA_CODEWORDS[ecLevel][v] - Math.ceil(byteLen > (v <= 9 ? 8 : 16) ? (v <= 9 ? 8 : 16) : 8) / 8
    if (DATA_CODEWORDS[ecLevel][v] >= byteLen + 3) { // 3 = mode(4bits) + count overhead
      version = v
      break
    }
    if (v === 10) version = 10
  }

  // 更精确的版本选择
  for (let v = 1; v <= 10; v++) {
    const dataCapacity = DATA_CODEWORDS[ecLevel][v]
    // Byte模式: 4位模式指示 + 计数位 + 数据
    const countBits = v <= 9 ? 8 : 16
    const totalBits = 4 + countBits + byteLen * 8
    const totalBytes = Math.ceil(totalBits / 8)
    if (totalBytes <= dataCapacity) {
      version = v
      break
    }
  }

  const size = VERSION_SIZES[version]
  const matrix = createMatrix(version)

  // 1. 放置三个定位图案
  placeFinderPattern(matrix, 0, 0)
  placeFinderPattern(matrix, 0, size - 7)
  placeFinderPattern(matrix, size - 7, 0)

  // 2. 放置对齐图案 (版本2+)
  if (version >= 2) {
    const alignPositions = getAlignmentPositions(version)
    for (const r of alignPositions) {
      for (const c of alignPositions) {
        // 跳过与定位图案重叠的位置
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 8) || (r >= size - 8 && c <= 8)) continue
        placeAlignmentPattern(matrix, r, c)
      }
    }
  }

  // 3. 放置时序图案
  placeTimingPatterns(matrix)

  // 4. 放置暗模块
  matrix[4 * version + 9][8] = { value: true, reserved: true }

  // 5. 编码数据
  const dataBits = encodeData(text, version, ecLevel)
  const ecBlockInfo = BLOCK_INFO[ecLevel][version]
  const dataCodewords = bitsToBytes(dataBits)

  // 6. 纠错编码
  const dataBlocks = []
  const ecBlocks = []
  let dataOffset = 0

  // 正常数据块
  for (let i = 0; i < ecBlockInfo[1]; i++) {
    const blockLen = ecBlockInfo[3]
    const block = dataCodewords.slice(dataOffset, dataOffset + blockLen)
    dataBlocks.push(block)
    ecBlocks.push(rsEncode(block, ecBlockInfo[2]))
    dataOffset += blockLen
  }

  // 剩余数据块（如果有）
  if (ecBlockInfo[4] > 0) {
    const blockLen = ecBlockInfo[5]
    const block = dataCodewords.slice(dataOffset, dataOffset + blockLen)
    dataBlocks.push(block)
    ecBlocks.push(rsEncode(block, ecBlockInfo[2]))
  }

  // 7. 交错数据块和纠错块
  const interleaved = []
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length))
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i])
    }
  }

  for (let i = 0; i < ecBlockInfo[2]; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) interleaved.push(block[i])
    }
  }

  // 转为位流
  const allBits = []
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((byte >> i) & 1)
    }
  }

  // 8. 放置数据位
  placeDataBits(matrix, allBits)

  // 9. 选择最佳掩码并应用
  let bestMask = 0
  let bestScore = Infinity

  for (let mask = 0; mask < 8; mask++) {
    // 创建副本
    const testMatrix = matrix.map(row => row.map(cell =>
      cell ? { ...cell } : { value: false, reserved: false }
    ))

    // 先放置格式信息
    placeFormatInfo(testMatrix, ecLevel, mask)
    // 应用掩码
    applyMask(testMatrix, mask)

    // 评估掩码得分
    const score = evaluateMaskPenalty(testMatrix)
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
    }
  }

  // 应用最佳掩码
  applyMask(matrix, bestMask)
  placeFormatInfo(matrix, ecLevel, bestMask)

  // 转为简单的布尔矩阵
  const result = []
  for (let r = 0; r < size; r++) {
    result[r] = []
    for (let c = 0; c < size; c++) {
      result[r][c] = matrix[r][c] ? matrix[r][c].value : false
    }
  }

  return result
}

/**
 * 获取对齐图案位置
 */
function getAlignmentPositions(version) {
  if (version === 1) return []
  if (version === 2) return [6, 18]
  if (version === 3) return [6, 22]
  if (version === 4) return [6, 26]
  if (version === 5) return [6, 30]
  if (version === 6) return [6, 34]
  if (version === 7) return [6, 22, 38]
  if (version === 8) return [6, 24, 42]
  if (version === 9) return [6, 26, 46]
  if (version === 10) return [6, 28, 50]
  return [6]
}

/**
 * 位流转字节
 */
function bitsToBytes(bits) {
  const bytes = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] || 0)
    }
    bytes.push(byte)
  }
  return bytes
}

/**
 * 评估掩码惩罚分数（简化版）
 */
function evaluateMaskPenalty(matrix) {
  const size = matrix.length
  let penalty = 0

  // 规则1: 连续相同颜色模块
  for (let row = 0; row < size; row++) {
    let count = 1
    for (let col = 1; col < size; col++) {
      if (matrix[row][col].value === matrix[row][col - 1].value) {
        count++
        if (count === 5) penalty += 3
        else if (count > 5) penalty += 1
      } else {
        count = 1
      }
    }
  }

  for (let col = 0; col < size; col++) {
    let count = 1
    for (let row = 1; row < size; row++) {
      if (matrix[row][col].value === matrix[row - 1][col].value) {
        count++
        if (count === 5) penalty += 3
        else if (count > 5) penalty += 1
      } else {
        count = 1
      }
    }
  }

  return penalty
}

// ===================== Canvas 绘制 =====================

/**
 * 在微信小程序 canvas 2d 上下文中绘制 QR 码
 * @param {CanvasRenderingContext2D} ctx - canvas 2d 上下文
 * @param {string} text - QR 码内容
 * @param {number} canvasWidth - canvas 宽度（像素）
 * @param {number} canvasHeight - canvas 高度（像素）
 * @param {object} options - 可选参数
 * @param {string} options.foreground - 前景色（默认黑色）
 * @param {string} options.background - 背景色（默认白色）
 * @param {number} options.margin - 边距（模块数，默认4）
 * @param {number} options.ecLevel - 纠错级别（默认0=L）
 */
function drawQRCode(ctx, text, canvasWidth, canvasHeight, options = {}) {
  const {
    foreground = '#000000',
    background = '#ffffff',
    margin = 4,
    ecLevel = 0
  } = options

  // 生成 QR 码矩阵
  const matrix = generateQRMatrix(text, ecLevel)
  const moduleCount = matrix.length

  // 计算模块大小
  const totalModules = moduleCount + margin * 2
  const cellSize = Math.floor(Math.min(canvasWidth, canvasHeight) / totalModules)
  const offsetX = Math.floor((canvasWidth - cellSize * totalModules) / 2)
  const offsetY = Math.floor((canvasHeight - cellSize * totalModules) / 2)

  // 清除画布并绘制背景
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 绘制二维码模块
  ctx.fillStyle = foreground
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          offsetX + (col + margin) * cellSize,
          offsetY + (row + margin) * cellSize,
          cellSize,
          cellSize
        )
      }
    }
  }
}

/**
 * 在微信小程序中使用 canvas 2d 绘制 QR 码的便捷方法
 * @param {string} canvasId - canvas 组件 ID
 * @param {string} text - QR 码内容
 * @param {object} options - 可选参数（同 drawQRCode）
 * @returns {Promise} 绘制完成的 Promise
 */
function drawQRCodeToCanvas(canvasId, text, options = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const query = wx.createSelectorQuery()
      query.select(canvasId)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) {
            reject(new Error('未找到 canvas 元素'))
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')

          // 设置 canvas 尺寸（使用 DPR）
          const dpr = wx.getWindowInfo().pixelRatio
          const displayWidth = res[0].width
          const displayHeight = res[0].height

          canvas.width = displayWidth * dpr
          canvas.height = displayHeight * dpr
          ctx.scale(dpr, dpr)

          // 绘制 QR 码
          drawQRCode(ctx, text, displayWidth, displayHeight, options)

          resolve()
        })
    }, 300)
  })
}

// ===================== 导出 =====================

module.exports = {
  generateQRMatrix,
  drawQRCode,
  drawQRCodeToCanvas,
  EC_LEVEL
}
