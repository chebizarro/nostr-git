import {describe, it, expect} from "vitest"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {getGitProvider} from "../src/index.node.js"

describe("git provider factory (node)", () => {
  it("init + version + statusMatrix should work with Node fs/http", async () => {
    const git = getGitProvider()
    const dir = mkdtempSync(join(tmpdir(), "git-wrapper-smoke-"))
    try {
      await git.init({dir})
      const v = await git.version()
      expect(typeof v === "string" || typeof v === "number").toBeTruthy()

      const matrix = await git.statusMatrix({dir})
      expect(Array.isArray(matrix)).toBe(true)
    } finally {
      // Best-effort cleanup
      try {
        rmSync(dir, {recursive: true, force: true})
      } catch {}
    }
  })
})
