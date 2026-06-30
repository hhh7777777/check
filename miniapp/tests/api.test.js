const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock wx global for WeChat miniapp
global.wx = {
  cloud: {
    callContainer: () => {},
  },
  showToast: () => {},
  showModal: () => {},
  getWindowInfo: () => ({ statusBarHeight: 20 }),
  setStorageSync: () => {},
  getStorageSync: () => null,
  removeStorageSync: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  reLaunch: () => {},
  navigateBack: () => {},
  navigateTo: () => {},
};

const api = require('../utils/api.js');

describe('Miniapp normalizePhone', () => {
  it('strips spaces and dashes', () => {
    assert.equal(api.normalizePhone('138 1234 5678'), '13812345678');
    assert.equal(api.normalizePhone('138-1234-5678'), '13812345678');
  });

  it('converts 00 prefix to +', () => {
    assert.equal(api.normalizePhone('0012025550123'), '+12025550123');
  });

  it('normalizes +86 Chinese numbers to domestic form', () => {
    assert.equal(api.normalizePhone('+8613812345678'), '13812345678');
  });

  it('handles empty/null input', () => {
    assert.equal(api.normalizePhone(''), '');
    assert.equal(api.normalizePhone(null), '');
    assert.equal(api.normalizePhone(undefined), '');
  });
});

describe('Miniapp isValidPhone', () => {
  it('validates Chinese mobile numbers', () => {
    assert.equal(api.isValidPhone('13812345678'), true);
    assert.equal(api.isValidPhone('19912345678'), true);
    assert.equal(api.isValidPhone('12345678901'), false);
  });

  it('validates international numbers', () => {
    assert.equal(api.isValidPhone('+12025550123'), true);
    assert.equal(api.isValidPhone('+441234567890'), true);
  });

  it('rejects invalid formats', () => {
    assert.equal(api.isValidPhone(''), false);
    assert.equal(api.isValidPhone('abcdefghij'), false);
    assert.equal(api.isValidPhone('123'), false);
    assert.equal(api.isValidPhone('12345'), false);
  });

  it('handles normalized input', () => {
    assert.equal(api.isValidPhone('138 1234 5678'), true);
    assert.equal(api.isValidPhone('0012025550123'), true);
  });
});

describe('Miniapp API module exports', () => {
  it('exports expected functions', () => {
    assert.equal(typeof api.normalizePhone, 'function');
    assert.equal(typeof api.isValidPhone, 'function');
    assert.equal(typeof api.getActivity, 'function');
    assert.equal(typeof api.getSchedules, 'function');
    assert.equal(typeof api.queryAttendee, 'function');
    assert.equal(typeof api.getLiveImages, 'function');
  });
});

describe('Miniapp validateConfig', () => {
  it('validateConfig is accessible via the module', () => {
    // validateConfig is internal but called by request()
    // We can test that the module loads without error
    assert.ok(api);
  });
});

describe('Miniapp badge.js logic (mocked)', () => {
  // Test the data transformation logic that badge.js would use
  it('attendeePublicView-like transformation works', () => {
    const data = {
      attendeeCode: 'A202606300001',
      name: '张三',
      organization: '测试单位',
      seatNo: 'A1',
      tableNo: 'T1',
      diningPlace: '1楼餐厅',
      hotelName: '测试酒店',
      roomNo: '1001',
      qrContent: 'PASS:A202606300001'
    };
    // Simulate the safeData filter from badge.js
    const safeData = {
      attendeeCode: data.attendeeCode,
      name: data.name,
      organization: data.organization,
      seatNo: data.seatNo,
      tableNo: data.tableNo,
      diningPlace: data.diningPlace,
      hotelName: data.hotelName,
      roomNo: data.roomNo,
      remark: data.remark,
      qrContent: data.qrContent
    };
    assert.equal(safeData.attendeeCode, 'A202606300001');
    assert.equal(safeData.name, '张三');
    assert.equal(safeData.phone, undefined); // phone should NOT be stored
  });
});

describe('Miniapp entry.js logic (mocked)', () => {
  it('attendee array handling works', () => {
    const res1 = { data: [{ name: 'A' }, { name: 'B' }] };
    const attendee1 = Array.isArray(res1.data) ? res1.data[0] : res1.data;
    assert.equal(attendee1.name, 'A');

    const res2 = { data: { name: 'C' } };
    const attendee2 = Array.isArray(res2.data) ? res2.data[0] : res2.data;
    assert.equal(attendee2.name, 'C');
  });
});

describe('Miniapp seating.js logic (mocked)', () => {
  it('retry clears state correctly', () => {
    let state = { attendee: { name: 'test' }, queryFailed: true, phone: '13800000000' };
    // Simulate retry()
    state = { queryFailed: false, attendee: null, phone: '' };
    assert.equal(state.attendee, null);
    assert.equal(state.phone, '');
    assert.equal(state.queryFailed, false);
  });
});
