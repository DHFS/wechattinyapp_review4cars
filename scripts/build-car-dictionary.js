const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const aliasesPath = path.join(rootDir, 'carDictionary.aliases.json')
const outputJsPath = path.join(rootDir, 'carDictionary.js')
const outputJsonPath = path.join(rootDir, 'cloudfunctions', 'suggestCarModels', 'carDictionary.json')

const sourceFiles = [
  path.join(rootDir, 'cars-batch-import.json'),
  path.join(rootDir, 'cars-simple.json'),
  path.join(rootDir, 'cars.json'),
  path.join(rootDir, 'cars-dictionary-seed.json')
]

function readJsonArray(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (!content) return []

  if (content.startsWith('[')) {
    return JSON.parse(content)
  }

  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function buildAutoAliases(name = '') {
  const raw = String(name || '').trim()
  if (!raw) return []

  const candidates = new Set([raw])
  const lower = raw.toLowerCase()

  candidates.add(lower)
  candidates.add(lower.replace(/\s+/g, ''))
  candidates.add(lower.replace(/[\s\-_.·•/]/g, ''))
  candidates.add(raw.replace(/\s+/g, ''))
  candidates.add(raw.replace(/[\s\-_.·•/]/g, ''))

  return [...candidates].filter(Boolean)
}

function loadAllCars() {
  const all = []

  sourceFiles.forEach(filePath => {
    if (!fs.existsSync(filePath)) return
    all.push(...readJsonArray(filePath))
  })

  return all
}

function buildDictionary(cars, aliasesConfig) {
  const brandMap = new Map()

  cars.forEach(car => {
    const brand = String(car.brand || '').trim()
    const modelName = String(car.model_name || '').trim()
    const powerType = String(car.power_type || '').trim()
    const priceRange = String(car.price_range || '').trim()

    if (!brand || !modelName) return

    if (!brandMap.has(brand)) {
      brandMap.set(brand, {
        name: brand,
        aliases: uniq([
          ...buildAutoAliases(brand),
          ...((aliasesConfig.brands && aliasesConfig.brands[brand]) || [])
        ]),
        models: new Map()
      })
    }

    const brandEntry = brandMap.get(brand)
    if (!brandEntry.models.has(modelName)) {
      brandEntry.models.set(modelName, {
        name: modelName,
        aliases: uniq([
          ...buildAutoAliases(modelName),
          ...(
            aliasesConfig.models &&
            aliasesConfig.models[brand] &&
            aliasesConfig.models[brand][modelName]
              ? aliasesConfig.models[brand][modelName]
              : []
          )
        ]),
        powerType: powerType || '',
        priceRange: priceRange || ''
      })
    } else {
      const existingModel = brandEntry.models.get(modelName)
      if (powerType && !existingModel.powerType) {
        existingModel.powerType = powerType
      }
      if (priceRange && !existingModel.priceRange) {
        existingModel.priceRange = priceRange
      }
    }
  })

  const brands = [...brandMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map(brandEntry => ({
      name: brandEntry.name,
      aliases: brandEntry.aliases,
      models: [...brandEntry.models.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }))

  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString().slice(0, 10),
    brands
  }
}

function writeOutputs(dictionary) {
  const jsContent = `module.exports = ${JSON.stringify(dictionary, null, 2)}\n`
  const jsonContent = `${JSON.stringify(dictionary, null, 2)}\n`

  fs.writeFileSync(outputJsPath, jsContent, 'utf8')
  fs.writeFileSync(outputJsonPath, jsonContent, 'utf8')
}

function main() {
  const aliasesConfig = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'))
  const cars = loadAllCars()
  const dictionary = buildDictionary(cars, aliasesConfig)

  writeOutputs(dictionary)

  console.log(`词典生成完成：${dictionary.brands.length} 个品牌`)
  console.log(`前端输出：${outputJsPath}`)
  console.log(`云函数输出：${outputJsonPath}`)
}

main()
