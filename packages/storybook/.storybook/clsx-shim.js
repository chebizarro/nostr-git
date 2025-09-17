// Minimal clsx-compatible shim used only for Storybook preview bundling
export default function clsx(...args) {
  let out = ""
  for (const a of args) {
    if (!a) continue
    if (typeof a === "string" || typeof a === "number") {
      out && (out += " ")
      out += a
    } else if (Array.isArray(a)) {
      const v = clsx(...a)
      if (v) {
        out && (out += " ")
        out += v
      }
    } else if (typeof a === "object") {
      for (const k in a) {
        if (a[k]) {
          out && (out += " ")
          out += k
        }
      }
    }
  }
  return out
}
