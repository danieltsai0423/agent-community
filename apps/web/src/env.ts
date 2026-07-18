export interface Env {
  /** service binding → tavern-api,web 不直接碰 DB */
  API: Fetcher;
  TURNSTILE_SITE_KEY: string;
}
