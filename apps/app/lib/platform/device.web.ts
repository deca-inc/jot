/**
 * Web shim for expo-device
 *
 * Returns browser/desktop info from navigator.userAgent.
 */

export const modelName: string =
  typeof navigator !== "undefined" ? navigator.userAgent : "Web Browser";

export const deviceName: string | null = "Web Browser";

export const manufacturer: string | null = null;

export const brand: string | null = null;

export const osName: string | null =
  typeof navigator !== "undefined" ? navigator.platform : null;

export const osVersion: string | null = null;

export const osBuildId: string | null = null;

export const isDevice: boolean = true;

export const deviceType: number = 3; // Desktop

export const DeviceType = {
  UNKNOWN: 0,
  PHONE: 1,
  TABLET: 2,
  DESKTOP: 3,
  TV: 4,
} as const;

export async function getDeviceTypeAsync(): Promise<number> {
  return DeviceType.DESKTOP;
}

export const totalMemory: number | null = null;
export const supportedCpuArchitectures: string[] | null = null;
