declare module "react-native-argon2" {
  interface Argon2Config {
    iterations?: number;
    memory?: number;
    parallelism?: number;
    hashLength?: number;
    mode?: "argon2i" | "argon2d" | "argon2id";
    saltEncoding?: "hex" | "utf8";
  }

  interface Argon2Result {
    rawHash: string;
    encodedHash: string;
  }

  function argon2(
    password: string,
    salt: string,
    config: Argon2Config
  ): Promise<Argon2Result>;

  export default argon2;
}
