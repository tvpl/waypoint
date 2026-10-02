// Lets CLI scripts import server modules guarded by `import "server-only"`.
import { register } from "node:module";

const hook = `export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  return next(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(hook));
