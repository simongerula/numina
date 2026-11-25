import pkg from "../../package.json";

/**
 * The app version, single-sourced from package.json. Server-only: pass it into
 * client components as a prop so the rest of package.json never ships in the
 * client bundle.
 */
export const APP_VERSION: string = pkg.version;
