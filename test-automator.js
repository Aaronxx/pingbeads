// 测试 miniprogram-automator 连接
const path = require('path');

async function main() {
  const automator = require('miniprogram-automator');
  
  console.log('尝试连接到微信开发者工具...');
  
  try {
    // 首先尝试连接
    const miniProgram = await automator.connect({
      projectPath: 'D:\\workspace\\pinbeans\\miniprogram',
      port: 9420
    });
    
    console.log('连接成功！');
    console.log('Pages:', await miniProgram.pages());
    
  } catch (e) {
    console.error('连接失败:', e.message);
    
    // 尝试 launch
    console.log('\n尝试 launch...');
    try {
      const mp = await automator.launch({
        projectPath: 'D:\\workspace\\pinbeans\\miniprogram'
      });
      console.log('Launch 成功:', mp);
    } catch (e2) {
      console.error('Launch 失败:', e2.message);
    }
  }
}

main();