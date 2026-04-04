declare module "sql.js-fts5" {
  import type { SqlJsStatic, Database } from "sql.js";
  export type { Database };
  const initSqlJs: (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
