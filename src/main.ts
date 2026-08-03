import * as core from "@actions/core"
import { Octokit } from "@octokit/rest"

function compareVersions(a: string, b: string): number {
  const aParts = a.match(/\d+/g)?.map(Number) ?? []
  const bParts = b.match(/\d+/g)?.map(Number) ?? []
  const length = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < length; i += 1) {
    const aPart = aParts[i] ?? 0
    const bPart = bParts[i] ?? 0
    if (aPart !== bPart) return aPart - bPart
  }
  return a.localeCompare(b)
}

export async function run(): Promise<void> {
  const repository: string = core.getInput("repository")
  const token: string = core.getInput("token")
  const includeDrafts: boolean = core.getInput("includeDrafts").toLowerCase() === "true"
  const includePreReleases: boolean = core.getInput("includePreReleases").toLowerCase() === "true"
  const excludesPattern: string = core.getInput("excludes")
  const includesPattern: string = core.getInput("includes")
  const fallbackToTags: boolean = core.getInput("fallbackToTags").toLowerCase() === "true"

  const octokit = token ? new Octokit({ auth: token }) : new Octokit()

  let excludesRegex: RegExp | null = null
  if (excludesPattern) {
    try {
      excludesRegex = new RegExp(excludesPattern)
    } catch {
      core.warning(`Invalid excludes regex: ${excludesPattern}`)
    }
  }

  let includesRegex: RegExp | null = null
  if (includesPattern) {
    try {
      includesRegex = new RegExp(includesPattern)
    } catch {
      core.warning(`Invalid includes regex: ${includesPattern}`)
    }
  }

  try {
    core.debug(`Repository input: ${repository}`)
    const [owner, repo] = repository.split("/")
    core.debug(`Owner: ${owner}, Repo: ${repo}`)
    if (!owner || owner.trim() === "" || !repo || repo.trim() === "") {
      core.setFailed("Invalid repository format. Owner or repo is empty.")
      return
    }
    const releases = await octokit.repos.listReleases({
      owner,
      repo,
    })
    core.debug(`Fetched ${releases.data.length} releases from API`)
    let data = releases.data
    if (!includePreReleases) {
      data = data.filter((x) => x.prerelease !== true)
      core.debug(`After prerelease filter: ${data.length} releases`)
    }
    if (!includeDrafts) {
      data = data.filter((x) => x.draft !== true)
      core.debug(`After draft filter: ${data.length} releases`)
    }
    if (excludesRegex) {
      data = data.filter((x) => !excludesRegex!.test(x.tag_name))
      core.info(`::debug::After excludes regex filter: ${data.length} releases`)
    }
    if (includesRegex) {
      data = data.filter((x) => includesRegex!.test(x.tag_name))
      core.info(`::debug::After includes regex filter: ${data.length} releases`)
    }
    if (data.length) {
      core.debug(`Latest release: ${data[0].tag_name}`)
      core.setOutput("release", data[0].tag_name)
      core.setOutput("id", String(data[0].id))
      core.setOutput("description", String(data[0].body))
      core.setOutput("url", String(data[0].url))
      core.setOutput("assetsUrl", String(data[0].assets_url))
    } else if (fallbackToTags) {
      core.info("No releases found after applying filters, falling back to tags")
      const tags = await octokit.repos.listTags({
        owner,
        repo,
      })
      core.debug(`Fetched ${tags.data.length} tags from API`)
      let tagData = tags.data
      if (excludesRegex) {
        tagData = tagData.filter((x) => !excludesRegex!.test(x.name))
        core.debug(`After excludes regex filter: ${tagData.length} tags`)
      }
      if (includesRegex) {
        tagData = tagData.filter((x) => includesRegex!.test(x.name))
        core.debug(`After includes regex filter: ${tagData.length} tags`)
      }
      if (tagData.length) {
        const latestTag = tagData.sort((a, b) => compareVersions(b.name, a.name))[0]
        core.debug(`Latest tag: ${latestTag.name}`)
        core.setOutput("release", latestTag.name)
        core.setOutput("id", latestTag.commit.sha)
        core.setOutput("description", "")
        core.setOutput("url", latestTag.commit.url)
        core.setOutput("assetsUrl", "")
      } else {
        core.setFailed("No releases or tags found after applying filters")
      }
    } else {
      core.setFailed("No releases found after applying filters")
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
