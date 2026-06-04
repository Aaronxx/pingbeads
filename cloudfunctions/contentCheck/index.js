const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const { contentType, value } = event;

  try {
    const buffer = Buffer.from(value, 'base64');

    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: contentType || 'image/jpeg',
        value: buffer
      }
    });

    if (result.errCode === 0) {
      return { code: 0, msg: 'ok' };
    } else if (result.errCode === 87014) {
      return { code: 87014, msg: '内容违规' };
    } else {
      console.error('内容安全检测异常:', result);
      return { code: result.errCode || -1, msg: '内容安全检测失败', detail: result.detail || result.errMsg };
    }
  } catch (err) {
    console.error('调用内容安全接口失败:', err);
    return { code: -1, msg: '内容安全检测接口调用失败', detail: err.errMsg || err.message };
  }
};
