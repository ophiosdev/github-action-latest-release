import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'

export async function run(): Promise<void> {
  const repository: string = core.getInput('repository')
  const token: string = core.getInput('token')
  const includeDrafts: boolean =
    core.getInput('includeDrafts').toLowerCase() === 'true'
  const includePreReleases: boolean =
    core.getInput('includePreReleases').toLowerCase() === 'true'
  const excludesPattern: string = core.getInput('excludes')
  const includesPattern: string = core.getInput('includes')

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
    const [owner, repo] = repository.split('/')
    core.debug(`Owner: ${owner}, Repo: ${repo}`)
    if (!owner || owner.trim() === '' || !repo || repo.trim() === '') {
      core.setFailed('Invalid repository format. Owner or repo is empty.')
      return
    }
    const releases = await octokit.repos.listReleases({
      owner,
      repo
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
      core.setOutput('release', data[0].tag_name)
      core.setOutput('id', String(data[0].id))
      core.setOutput('description', String(data[0].body))
      core.setOutput('url', String(data[0].url))
      core.setOutput('assetsUrl', String(data[0].assets_url))
    } else {
      core.setFailed('No releases found after applying filters')
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
