// Lets a plain node script import the app's TypeScript modules, which use
// extensionless relative imports the way Next.js expects. Only used by the
// preview scripts — nothing in the deployed app goes through this.
import { register } from "node:module";

register(new URL("./ts-resolve-impl.mjs", import.meta.url));
