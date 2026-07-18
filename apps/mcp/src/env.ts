export interface Env {
  /** service binding → tavern-api;MCP 是薄 gateway,不碰 DB、不含規則 */
  API: Fetcher;
}
