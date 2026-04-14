// 云函数：微信内容安全检测
// 使用 openapi.security.msgSecCheck 对用户输入内容做发布前审核。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 临时开关：
// 当前版本为了尽快上线，先关闭微信内容安全接口调用，改由管理员人工审核。
// 后续若要恢复 msgSecCheck，只需改回 true 并重新部署本云函数。
const CONTENT_SECURITY_ENABLED = false

function buildContentToCheck(event = {}) {
  const title = normalizeUtf8Text(event.title)
  const content = normalizeUtf8Text(event.content)

  return [title, content].filter(Boolean).join('\n')
}

function normalizeUtf8Text(value = '') {
  const rawText = String(value || '').trim()
  if (!rawText) return ''

  // 统一 Unicode 规范，移除空字符，再做一次 UTF-8 编码往返，
  // 用于尽量规避异常字符形态对内容安全接口的影响。
  const normalizedText = rawText
    .normalize('NFC')
    .replace(/\u0000/g, '')

  return Buffer.from(normalizedText, 'utf8').toString('utf8')
}

function createTraceId() {
  return `security-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function maskOpenid(openid = '') {
  if (!openid) return ''
  if (openid.length <= 8) return openid
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`
}

function buildLogContext(traceId, wxContext, event = {}, content = '') {
  return {
    traceId,
    openid: maskOpenid(wxContext?.OPENID || ''),
    appid: wxContext?.APPID || '',
    env: wxContext?.ENV || '',
    titleLength: String(event.title || '').trim().length,
    contentLength: content.length,
    hasTitle: !!String(event.title || '').trim(),
    hasContent: !!String(event.content || '').trim()
  }
}

function extractErrorMeta(err) {
  if (!err) {
    return {}
  }

  const propertyNames = Object.getOwnPropertyNames(err)
  const plainObject = {}

  propertyNames.forEach((key) => {
    const value = err[key]

    if (value === undefined) {
      return
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      plainObject[key] = value
      return
    }

    if (value && typeof value === 'object') {
      try {
        plainObject[key] = JSON.parse(JSON.stringify(value))
      } catch (jsonErr) {
        plainObject[key] = String(value)
      }
    }
  })

  return {
    propertyNames,
    rid: err.rid || err.requestId || err.request_id || '',
    response: err.response || null,
    raw: plainObject
  }
}

function buildUnsafeResult(errCode, errMsg) {
  let message = '内容安全检测未通过，请调整后重试'

  if (errCode === 87014) {
    message = '内容含有违规词汇，请修改后重试'
  } else if (errCode === -604101) {
    message = '内容安全服务配置异常，请稍后重试'
  }

  return {
    success: false,
    safe: false,
    errCode,
    errMsg: errMsg || '',
    debugMessage: `[${errCode}] ${errMsg || ''}`,
    message
  }
}

exports.main = async (event) => {
  const content = buildContentToCheck(event)
  const traceId = createTraceId()
  const wxContext = cloud.getWXContext()
  const logContext = buildLogContext(traceId, wxContext, event, content)

  console.log('checkContentSecurity 入口触发', logContext)

  // 无文本时直接视为通过，避免空内容误调用接口。
  if (!content) {
    console.log('checkContentSecurity 跳过检测（空内容）', logContext)
    return {
      success: true,
      safe: true,
      errCode: 0,
      errMsg: 'ok',
      message: '无需检测'
    }
  }

  if (!CONTENT_SECURITY_ENABLED) {
    console.log('checkContentSecurity 已关闭，当前版本改为人工审核放行', logContext)
    return {
      success: true,
      safe: true,
      errCode: 0,
      errMsg: 'disabled',
      message: '内容安全检测已关闭，当前由管理员人工审核'
    }
  }

  try {
    console.log('checkContentSecurity 开始调用 msgSecCheck', logContext)

    const res = await cloud.openapi.security.msgSecCheck({
      content
    })

    const errCode = Number(res?.errCode || 0)
    const errMsg = res?.errMsg || 'ok'

    console.log('checkContentSecurity msgSecCheck 返回', {
      ...logContext,
      errCode,
      errMsg
    })

    if (errCode !== 0) {
      console.error('checkContentSecurity 未通过:', {
        ...logContext,
        errCode,
        errMsg
      })
      return buildUnsafeResult(errCode, errMsg)
    }

    return {
      success: true,
      safe: true,
      errCode: 0,
      errMsg,
      message: '内容安全'
    }
  } catch (err) {
    const errCode = Number(err?.errCode || err?.errno || -1)
    const errMsg = err?.errMsg || err?.message || '内容安全检测失败'

    if (errCode === 87014) {
      console.error('checkContentSecurity 命中违规内容', {
        ...logContext,
        errCode,
        errMsg
      })
      return buildUnsafeResult(errCode, errMsg)
    }

    console.error('checkContentSecurity 调用异常:', {
      ...logContext,
      errCode,
      errMsg,
      stack: err?.stack || '',
      errorMeta: extractErrorMeta(err)
    })

    return {
      success: false,
      safe: false,
      errCode,
      errMsg,
      debugMessage: `[${errCode}] ${errMsg}`,
      message: errCode === -604101
        ? '内容安全服务配置异常，请稍后重试'
        : '内容安全检测失败，请稍后重试'
    }
  }
}
