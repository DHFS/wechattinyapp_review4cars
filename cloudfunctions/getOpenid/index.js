// 云函数：获取用户 OpenID，并附带返回管理员身份
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

async function getAdminStatus(openid = '') {
  if (!openid) return false

  try {
    const res = await db.collection('admin_users')
      .where({
        _openid: openid,
        status: 'active'
      })
      .limit(1)
      .get()

    return (res.data || []).length > 0
  } catch (err) {
    // 如果管理员集合还没创建，不阻塞登录流程，默认按非管理员处理。
    console.warn('读取 admin_users 失败，按非管理员兜底:', err.message)
    return false
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const isAdmin = await getAdminStatus(openid)

  return {
    event,
    openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    isAdmin
  }
}
