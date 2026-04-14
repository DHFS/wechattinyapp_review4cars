const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')

function loadCarDictionary() {
  const candidatePaths = [
    path.join(__dirname, 'carDictionary.json'),
    path.join(__dirname, 'carDictionary.js')
  ]

  for (const filePath of candidatePaths) {
    try {
      if (!fs.existsSync(filePath)) {
        continue
      }

      if (filePath.endsWith('.json')) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      }

      // 兼容后续如果把词典改成 JS 导出文件的情况。
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(filePath)
    } catch (err) {
      console.warn('加载车型词典失败，尝试下一个候选文件:', filePath, err.message)
    }
  }

  console.warn('未找到车型词典文件，suggestCarModels 将退化为无纠错建议模式')
  return { brands: [] }
}

const carDictionary = loadCarDictionary()

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const BRAND_ENTRIES = carDictionary.brands || []

function normalizeText(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.·•/]/g, '')
}

function buildBrandKeywords(entry) {
  return [entry.name, ...(entry.aliases || [])]
    .map(normalizeText)
    .filter(Boolean)
}

function buildModelKeywords(model) {
  return [model.name, ...(model.aliases || [])]
    .map(normalizeText)
    .filter(Boolean)
}

function getBrandEntryByName(name = '') {
  return BRAND_ENTRIES.find(entry => entry.name === name) || null
}

function findExactBrandEntry(input = '') {
  const normalizedInput = normalizeText(input)
  if (!normalizedInput) return null

  return BRAND_ENTRIES.find(entry => buildBrandKeywords(entry).includes(normalizedInput)) || null
}

function findExactModelEntry(brandEntry, input = '') {
  if (!brandEntry) return null

  const normalizedInput = normalizeText(input)
  if (!normalizedInput) return null

  return (brandEntry.models || []).find(model => buildModelKeywords(model).includes(normalizedInput)) || null
}

function getModelSuggestionsForBrand(brandEntry, query = '') {
  if (!brandEntry) return []

  const normalizedQuery = normalizeText(query)
  const models = brandEntry.models || []

  if (!normalizedQuery) {
    return models.slice(0, 5).map(model => ({
      brand: brandEntry.name,
      model: model.name,
      powerType: model.powerType || '',
      priceRange: model.priceRange || '',
      score: 0.7
    }))
  }

  return models
    .filter(model => buildModelKeywords(model).some(keyword => keyword.includes(normalizedQuery)))
    .slice(0, 5)
    .map(model => ({
      brand: brandEntry.name,
      model: model.name,
      powerType: model.powerType || '',
      priceRange: model.priceRange || '',
      score: 0.86
    }))
}

function getBrandSuggestions(query = '') {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  return BRAND_ENTRIES
    .filter(entry => buildBrandKeywords(entry).some(keyword => keyword.includes(normalizedQuery)))
    .slice(0, 5)
    .map(entry => entry.name)
}

function getCrossBrandModelSuggestions(query = '', limit = 5) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  const results = []

  BRAND_ENTRIES.forEach(brandEntry => {
    ;(brandEntry.models || []).forEach(model => {
      if (buildModelKeywords(model).some(keyword => keyword.includes(normalizedQuery))) {
        results.push({
          brand: brandEntry.name,
          model: model.name,
          powerType: model.powerType || '',
          priceRange: model.priceRange || '',
          score: 0.8
        })
      }
    })
  })

  return results.slice(0, limit)
}

exports.main = async (event) => {
  const brandText = (event.brandText || '').trim()
  const modelText = (event.modelText || '').trim()
  const limit = Number(event.limit) || 3

  const exactBrandEntry = findExactBrandEntry(brandText)
  const exactModelEntry = findExactModelEntry(exactBrandEntry, modelText)

  let suggestions = []
  let normalizedBrand = exactBrandEntry ? exactBrandEntry.name : brandText

  if (exactBrandEntry) {
    suggestions = getModelSuggestionsForBrand(exactBrandEntry, modelText).slice(0, limit)
  } else {
    const brandCandidates = getBrandSuggestions(brandText)
    const matchedBrandEntry = getBrandEntryByName(brandCandidates[0])

    normalizedBrand = matchedBrandEntry ? matchedBrandEntry.name : brandText
    suggestions = matchedBrandEntry
      ? getModelSuggestionsForBrand(matchedBrandEntry, modelText).slice(0, limit)
      : getCrossBrandModelSuggestions(modelText, limit)
  }

  if (exactBrandEntry && exactModelEntry) {
    suggestions = [{
      brand: exactBrandEntry.name,
      model: exactModelEntry.name,
      powerType: exactModelEntry.powerType || '',
      priceRange: exactModelEntry.priceRange || '',
      score: 0.99
    }]
  }

  // TODO: 后续可在本地词典结果不足时接入混元做纠错排序。
  return {
    success: true,
    normalizedBrand,
    exactBrandMatched: !!exactBrandEntry,
    exactModelMatched: !!exactModelEntry,
    bestMatch: suggestions[0] || null,
    suggestions
  }
}
