/**
 * Web shim for expo-asset
 *
 * Provides a stub Asset class. On web, asset loading
 * is handled differently (bundled by webpack).
 */

export class Asset {
  uri: string = "";
  localUri: string | null = null;
  name: string = "";
  type: string = "";
  width: number | null = null;
  height: number | null = null;
  hash: string | null = null;

  static fromModule(_module: number | { uri: string }): Asset {
    return new Asset();
  }

  static fromURI(uri: string): Asset {
    const asset = new Asset();
    asset.uri = uri;
    asset.localUri = uri;
    return asset;
  }

  async downloadAsync(): Promise<this> {
    return this;
  }
}
