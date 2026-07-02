const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isLightColor, formatMarkCode, parseMarkCode } = require('../src/utils/colorHelpers');

describe('isLightColor', () => {
  it('白色应为浅色', () => {
    assert.equal(isLightColor('#FFFFFF'), true);
  });

  it('黑色应为深色', () => {
    assert.equal(isLightColor('#000000'), false);
  });

  it('浅灰色应为浅色', () => {
    assert.equal(isLightColor('#C0C0C0'), true);
  });

  it('3位 hex 应正常处理', () => {
    assert.equal(isLightColor('#FFF'), true);
    assert.equal(isLightColor('#000'), false);
  });

  it('null/空值应返回 false', () => {
    assert.equal(isLightColor(null), false);
    assert.equal(isLightColor(''), false);
  });

  it('无效长度应返回 false', () => {
    assert.equal(isLightColor('#FF'), false);
  });
});

describe('formatMarkCode', () => {
  it('正常色号直接返回', () => {
    assert.equal(formatMarkCode('A1'), 'A1');
    assert.equal(formatMarkCode('ZG1'), 'ZG1');
  });

  it('空值返回空字符串', () => {
    assert.equal(formatMarkCode(''), '');
    assert.equal(formatMarkCode(null), '');
  });
});

describe('parseMarkCode', () => {
  it('标准格式 A1', () => {
    assert.equal(parseMarkCode('A1'), 'A1');
  });

  it('带前导零 A01 -> A1', () => {
    assert.equal(parseMarkCode('A01'), 'A1');
  });

  it('小写输入 a1 -> A1', () => {
    assert.equal(parseMarkCode('a1'), 'A1');
  });

  it('双字母前缀 ZG1', () => {
    assert.equal(parseMarkCode('ZG1'), 'ZG1');
    assert.equal(parseMarkCode('zg01'), 'ZG1');
  });

  it('无效输入返回 null', () => {
    assert.equal(parseMarkCode(''), null);
    assert.equal(parseMarkCode(null), null);
    assert.equal(parseMarkCode('123'), null);
    assert.equal(parseMarkCode('ABC'), null);
  });
});
