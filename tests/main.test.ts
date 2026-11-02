import { run, compareVersions, groupByMajor, type ReleaseOutput } from "../src/main"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { inputs, outputs, failure, api } = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  outputs: {} as Record<string, string>,
  failure: { message: "" },
  api: {
    releases: [] as unknown[],
    tags: [] as unknown[],
    throwUp: "",
    throwNonError: false as boolean,
  },
}))

vi.mock("@actions/core", () => ({
  getInput: (name: string) => inputs[name] ?? "",
  setOutput: (name: string, value: unknown) => {
    outputs[name] = String(value)
  },
  setFailed: (message: unknown) => {
    failure.message = String(message)
  },
  debug: () => {},
  info: () => {},
  warning: () => {},
}))

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = {
      listReleases: async () => {
        if (api.throwUp) throw new Error(api.throwUp)
        if (api.throwNonError) throw "not an Error"
        return { data: api.releases }
      },
      listTags: async () => ({ data: api.tags }),
    }
  },
}))

const release = (
  tag: string,
  id: number,
  extra: Partial<{ prerelease: boolean; draft: boolean; body: string }> = {},
) => ({
  tag_name: tag,
  id,
  body: `body of ${tag}`,
  url: `https://api.github.com/repos/owner/repo/releases/${id}`,
  assets_url: `https://api.github.com/repos/owner/repo/releases/${id}/assets`,
  prerelease: false,
  draft: false,
  ...extra,
})

describe("compareVersions", () => {
  it("compares numeric parts", () => {
    expect(compareVersions("1.19.1", "1.2.10")).toBeGreaterThan(0)
    expect(compareVersions("1.2.10", "1.19.1")).toBeLessThan(0)
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0)
  })

  it("falls back to text comparison when there are no numeric parts", () => {
    expect(compareVersions("a", "b")).toBeLessThan(0)
  })

  it("pads missing parts with zero", () => {
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0)
  })

  it("ignores v prefixes", () => {
    expect(compareVersions("v1.10.0", "v1.2.0")).toBeGreaterThan(0)
    expect(compareVersions("v1.2.0", "v2.0.0")).toBeLessThan(0)
  })
})

describe("groupByMajor", () => {
  const versionOf = (x: { tag: string }) => x.tag
  const latestOf = (x: { tag: string; id: number }): ReleaseOutput => ({
    release: x.tag,
    id: String(x.id),
    description: "",
    url: "",
    assetsUrl: "",
  })

  it("returns the latest release per major version, newest major first", () => {
    const items = ["2.2.5", "2.2.0", "2.0.0", "1.19.5", "1.19.1", "1.18.0"].map((tag, id) => ({
      tag,
      id,
    }))
    expect(groupByMajor(items, versionOf, latestOf).map((o) => o.release)).toEqual([
      "2.2.5",
      "1.19.5",
    ])
  })

  it("handles v prefixes and unordered input", () => {
    const items = ["v1.2.0", "v1.10.0", "v0.9.9", "v1.9.1"].map((tag, id) => ({ tag, id }))
    expect(groupByMajor(items, versionOf, latestOf).map((o) => o.release)).toEqual([
      "v1.10.0",
      "v0.9.9",
    ])
  })

  it("ignores entries without a version number", () => {
    expect(groupByMajor([{ tag: "latest" }], versionOf, latestOf)).toEqual([])
  })

  it("returns an empty array for empty input", () => {
    expect(groupByMajor([], versionOf, latestOf)).toEqual([])
  })

  it("picks the newest within one major version", () => {
    const items = ["1.1.0", "1.9.0", "1.3.0"].map((tag, id) => ({ tag, id }))
    expect(groupByMajor(items, versionOf, latestOf).map((o) => o.release)).toEqual(["1.9.0"])
  })

  it("sorts majors in descending order regardless of input order", () => {
    const items = ["0.1.0", "3.0.0", "2.9.9"].map((tag, id) => ({ tag, id }))
    expect(groupByMajor(items, versionOf, latestOf).map((o) => o.release)).toEqual([
      "3.0.0",
      "2.9.9",
      "0.1.0",
    ])
  })
})

describe("run", () => {
  beforeEach(() => {
    for (const key of Object.keys(inputs)) delete inputs[key]
    for (const key of Object.keys(outputs)) delete outputs[key]
    failure.message = ""
    api.releases = []
    api.tags = []
    api.throwUp = ""
    api.throwNonError = false
    inputs.repository = "owner/repo"
  })

  it("outputs the first release after applying default filters", async () => {
    api.releases = [
      release("2.0.0", 100),
      release("9.9.9", 300, { draft: true }),
      release("8.8.8", 200, { prerelease: true }),
    ]
    await run()
    expect(outputs.release).toBe("2.0.0")
    expect(outputs.id).toBe("100")
    expect(outputs.description).toBe("body of 2.0.0")
    expect(outputs.url).toContain("/releases/100")
    expect(outputs.assetsUrl).toContain("/releases/100/assets")
  })

  it("includes drafts and prereleases when requested", async () => {
    inputs.includeDrafts = "true"
    inputs.includePreReleases = "true"
    api.releases = [release("2.0.0-beta1", 200, { prerelease: true }), release("1.0.0", 100)]
    await run()
    expect(outputs.release).toBe("2.0.0-beta1")
  })

  it("applies excludes and includes filters", async () => {
    inputs.excludes = "^v0"
    inputs.includes = "beta"
    api.releases = [release("1.0.0", 100), release("v0.9.0", 90), release("2.0.0-beta1", 50)]
    await run()
    expect(outputs.release).toBe("2.0.0-beta1")
  })

  it("emits a JSON array with the latest release per major version", async () => {
    inputs.groupByMajorVersion = "true"
    api.releases = [
      release("2.2.5", 1001),
      release("2.2.0", 1000, { draft: true }),
      release("2.0.0", 950),
      release("1.19.5", 900),
      release("1.19.1", 850, { prerelease: true }),
      release("1.18.0", 800),
    ]
    await run()
    const grouped = JSON.parse(outputs.release) as ReleaseOutput[]
    expect(grouped).toEqual([
      {
        release: "2.2.5",
        id: "1001",
        description: "body of 2.2.5",
        url: "https://api.github.com/repos/owner/repo/releases/1001",
        assetsUrl: "https://api.github.com/repos/owner/repo/releases/1001/assets",
      },
      {
        release: "1.19.5",
        id: "900",
        description: "body of 1.19.5",
        url: "https://api.github.com/repos/owner/repo/releases/900",
        assetsUrl: "https://api.github.com/repos/owner/repo/releases/900/assets",
      },
    ])
    expect(outputs.id).toBeUndefined()
  })

  it("falls back to the latest tag and supports grouping there too", async () => {
    inputs.fallbackToTags = "true"
    inputs.groupByMajorVersion = "true"
    api.tags = [
      { name: "v1.10.0", commit: { sha: "sha2", url: "https://u/v1.10.0" } },
      { name: "v1.2.0", commit: { sha: "sha1", url: "https://u/v1.2.0" } },
      { name: "v0.9.9", commit: { sha: "sha0", url: "https://u/v0.9.9" } },
    ]
    await run()
    expect((JSON.parse(outputs.release) as ReleaseOutput[]).map((o) => o.release)).toEqual([
      "v1.10.0",
      "v0.9.9",
    ])
  })

  it("falls back to the latest tag without grouping", async () => {
    inputs.fallbackToTags = "true"
    api.tags = [
      { name: "v1.10.0", commit: { sha: "sha2", url: "https://u/v1.10.0" } },
      { name: "v1.2.0", commit: { sha: "sha1", url: "https://u/v1.2.0" } },
    ]
    await run()
    expect(outputs.release).toBe("v1.10.0")
    expect(outputs.id).toBe("sha2")
    expect(outputs.description).toBe("")
    expect(outputs.url).toBe("https://u/v1.10.0")
    expect(outputs.assetsUrl).toBe("")
  })

  it("still works when excludes regex is invalid", async () => {
    inputs.excludes = "["
    api.releases = [release("1.0.0", 100)]
    await run()
    expect(outputs.release).toBe("1.0.0")
  })

  it("still works when includes regex is invalid", async () => {
    inputs.includes = "["
    api.releases = [release("1.0.0", 100)]
    await run()
    expect(outputs.release).toBe("1.0.0")
  })

  it("fails on invalid repository format", async () => {
    inputs.repository = "nodash"
    await run()
    expect(failure.message).toBe("Invalid repository format. Owner or repo is empty.")
  })

  it("fails on empty repository", async () => {
    inputs.repository = ""
    await run()
    expect(failure.message).toBe("Invalid repository format. Owner or repo is empty.")
  })

  it("fails when the owner is only whitespace", async () => {
    inputs.repository = "   /repo"
    await run()
    expect(failure.message).toBe("Invalid repository format. Owner or repo is empty.")
  })

  it("fails when the repository name is only whitespace", async () => {
    inputs.repository = "owner/   "
    await run()
    expect(failure.message).toBe("Invalid repository format. Owner or repo is empty.")
  })

  it("authenticates with the token when set", async () => {
    inputs.token = "token-value"
    api.releases = [release("1.0.0", 100)]
    await run()
    expect(outputs.release).toBe("1.0.0")
  })

  it("fails when no releases match and fallback is off", async () => {
    inputs.excludes = "^1\\.0\\.0$"
    api.releases = [release("1.0.0", 100)]
    await run()
    expect(failure.message).toBe("No releases found after applying filters")
  })

  it("filters tags with excludes and includes on fallback", async () => {
    inputs.fallbackToTags = "true"
    inputs.excludes = "^v0"
    inputs.includes = "beta"
    api.tags = [
      { name: "v1.10.0", commit: { sha: "sha2", url: "https://u/v1.10.0" } },
      { name: "v0.9.0", commit: { sha: "sha0", url: "https://u/v0.9.0" } },
      { name: "1.0.0", commit: { sha: "shax", url: "https://u/1.0.0" } },
      { name: "v2.0.0-beta1", commit: { sha: "sha3", url: "https://u/v2.0.0-beta1" } },
    ]
    await run()
    expect(outputs.release).toBe("v2.0.0-beta1")
  })

  it("fails when all tags are filtered out on fallback", async () => {
    inputs.fallbackToTags = "true"
    inputs.excludes = "^v1"
    api.tags = [{ name: "v1.0.0", commit: { sha: "sha1", url: "https://u/v1.0.0" } }]
    await run()
    expect(failure.message).toBe("No releases or tags found after applying filters")
  })

  it("fails with the error message when the API call fails", async () => {
    api.throwUp = "API rate limit exceeded"
    await run()
    expect(failure.message).toBe("API rate limit exceeded")
  })

  it("does not report non-Error thrown values as failures", async () => {
    api.throwNonError = true
    await run()
    expect(failure.message).toBe("")
  })
})
