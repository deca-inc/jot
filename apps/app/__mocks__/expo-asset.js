/* global module, jest */
module.exports = {
  Asset: {
    fromModule: jest.fn().mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({}),
      localUri: "file:///mock/asset.pte",
    }),
  },
};
