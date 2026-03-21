const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const seedPath = path.join(rootDir, 'cars-dictionary-seed.json')

const defaultCsvFiles = [
  '/tmp/numbers_export/SUV排名数据-表格 1.csv',
  '/tmp/numbers_export/轿车排名数据-表格 1.csv'
]

const brandMap = {
  '特斯拉中国': '特斯拉',
  '小米汽车': '小米',
  '理想汽车': '理想',
  '蔚来': '蔚来',
  '小鹏汽车': '小鹏',
  '深蓝汽车': '深蓝',
  '岚图汽车': '岚图',
  '阿维塔科技': '阿维塔',
  '腾势汽车': '腾势',
  '赛力斯汽车': '问界',
  '赛力斯蓝电汽车': '蓝电',
  '吉利汽车': '吉利',
  '吉利银河': '吉利银河',
  '长安汽车': '长安',
  '长安启源': '长安启源',
  '奇瑞汽车': '奇瑞',
  '奇瑞新能源': '奇瑞新能源',
  '一汽红旗': '红旗',
  '华晨宝马': '宝马',
  '北京奔驰': '奔驰',
  '一汽奥迪': '奥迪',
  '上汽奥迪': '奥迪',
  '一汽丰田': '丰田',
  '广汽丰田': '丰田',
  '广汽本田': '本田',
  '东风本田': '本田',
  '东风日产': '日产',
  '长安福特': '福特',
  '江铃福特': '福特',
  '上汽大众': '大众',
  '一汽-大众': '大众',
  '上汽通用别克': '别克',
  '别克至境': '别克',
  '上汽通用凯迪拉克': '凯迪拉克',
  '沃尔沃亚太': '沃尔沃',
  '长安马自达': '马自达',
  '北京现代': '现代',
  '起亚': '起亚',
  '上汽大众斯柯达': '斯柯达',
  '上汽通用雪佛兰': '雪佛兰',
  '广汽传祺': '传祺',
  '广汽埃安新能源': '埃安',
  '东风乘用车': '东风',
  '上汽集团': '上汽',
  '上汽通用五菱': '五菱',
  '长城汽车': '长城',
  '北京汽车': '北京汽车',
  '北京汽车制造厂': '北京汽车制造厂',
  '方程豹': '方程豹',
  '智己汽车': '智己',
  '江铃集团新能源': '羿驰',
  '奇瑞捷豹路虎': '路虎',
  '一汽奔腾': '奔腾',
  '长安林肯': '林肯',
  '东风标致': '标致',
  '东风雪铁龙': '雪铁龙',
  '东风风行': '东风风行',
  '江淮汽车': '江淮',
  '猛士科技': '猛士',
  '星途': '星途',
  'smart': 'smart',
  '二一二越野车': '212'
}

const modelBrandRules = [
  { prefix: '哈弗', brand: '哈弗', trim: true },
  { prefix: '坦克', brand: '坦克', trim: false },
  { prefix: '欧拉', brand: '欧拉', trim: true },
  { prefix: '魏牌', brand: '魏牌', trim: true },
  { prefix: '蓝山', brand: '魏牌', trim: false },
  { prefix: '荣威', brand: '荣威', trim: true },
  { prefix: 'MG', brand: 'MG', trim: false },
  { prefix: '宝骏', brand: '宝骏', trim: true },
  { prefix: '五菱', brand: '五菱', trim: false },
  { prefix: 'AION', brand: '埃安', trim: false },
  { prefix: '纳米', brand: '东风纳米', trim: false },
  { prefix: '风神', brand: '东风风神', trim: false },
  { prefix: '东风风神', brand: '东风风神', trim: true },
  { prefix: 'eπ', brand: '奕派', trim: false },
  { prefix: 'iCAR', brand: 'iCAR', trim: false },
  { prefix: '奇瑞QQ', brand: '奇瑞新能源', trim: false },
  { prefix: '问界', brand: '问界', trim: false },
  { prefix: '智界', brand: '智界', trim: false },
  { prefix: '享界', brand: '享界', trim: false },
  { prefix: '宝马', brand: '宝马', trim: true },
  { prefix: '奔驰', brand: '奔驰', trim: true },
  { prefix: '奥迪', brand: '奥迪', trim: true },
  { prefix: '本田', brand: '本田', trim: true },
  { prefix: '日产', brand: '日产', trim: true },
  { prefix: '大众', brand: '大众', trim: true },
  { prefix: '长安', brand: '长安', trim: true },
  { prefix: '丰田', brand: '丰田', trim: true },
  { prefix: '小米', brand: '小米', trim: true }
]

function readCsvRows(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  return content
    .split(/\r?\n/)
    .map(line => line.split(','))
    .filter(cols => cols.length >= 8 && /^\d+$/.test((cols[1] || '').trim()))
    .map(cols => ({
      rank: Number(cols[1].trim()),
      model: (cols[2] || '').trim(),
      brand: (cols[3] || '').trim(),
      priceRange: (cols[4] || '').trim(),
      minPrice: Number(cols[5] || 0),
      maxPrice: Number(cols[6] || 0),
      powerType: (cols[7] || '').trim()
    }))
}

function normalizeBrand(rawBrand) {
  return brandMap[rawBrand] || rawBrand
}

function normalizeModel(rawModel, normalizedBrand) {
  let model = rawModel.trim()

  for (const rule of modelBrandRules) {
    if (model.startsWith(rule.prefix)) {
      if (rule.brand) {
        normalizedBrand = rule.brand
      }
      if (rule.trim) {
        model = model.slice(rule.prefix.length).trim()
      }
      break
    }
  }

  if (normalizedBrand && model.startsWith(normalizedBrand)) {
    model = model.slice(normalizedBrand.length).trim()
  }

  model = model
    .replace(/^中国版\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { model, brand: normalizedBrand }
}

function toSeedEntry(row) {
  let normalizedBrand = normalizeBrand(row.brand)
  const normalized = normalizeModel(row.model, normalizedBrand)
  normalizedBrand = normalized.brand

  return {
    brand: normalizedBrand,
    model_name: normalized.model,
    model_year: '2026年2月榜单',
    power_type: row.powerType || '',
    price_range: row.priceRange || (
      row.minPrice && row.maxPrice
        ? `${row.minPrice}-${row.maxPrice}万`
        : ''
    )
  }
}

function dedupeEntries(entries) {
  const map = new Map()

  for (const entry of entries) {
    if (!entry.brand || !entry.model_name) continue
    const key = `${entry.brand}__${entry.model_name}`.toLowerCase()
    if (!map.has(key)) {
      map.set(key, entry)
    }
  }

  return [...map.values()].sort((a, b) => {
    const brandCmp = a.brand.localeCompare(b.brand, 'zh-Hans-CN')
    if (brandCmp !== 0) return brandCmp
    return a.model_name.localeCompare(b.model_name, 'zh-Hans-CN')
  })
}

function main() {
  const csvFiles = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultCsvFiles
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  const importedRows = csvFiles.flatMap(readCsvRows)
  const importedEntries = importedRows.map(toSeedEntry)
  const merged = dedupeEntries([...seed, ...importedEntries])

  fs.writeFileSync(seedPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')

  console.log(`导入完成：原始行 ${importedRows.length} 条`)
  console.log(`导入后 seed 共 ${merged.length} 条`)
  console.log(`已写入：${seedPath}`)
}

main()
