/* global module, jest */
module.exports = {
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  downloadAsync: jest.fn(),
};
