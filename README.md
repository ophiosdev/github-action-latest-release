# GitHub Action - Get Latest Release

A simple GitHub Action to get the latest release from another repository.

## Configuration

Example Repository - https://github.com/ophiosdev/github-action-latest-release

### Inputs

| Name               | Description                                                               | Required | Default | Example                                |
| ------------------ | ------------------------------------------------------------------------- | -------- | ------- | -------------------------------------- |
| repository         | The repository name in full                                               | Yes      | N/A     | ophiosdev/github-action-latest-release |
| includeDrafts      | Whether to include draft releases. Defaults to false.                     | No       | false   | "true"                                 |
| includePreReleases | Whether to include prerelease versions. Defaults to false.                | No       | false   | "true"                                 |
| excludes           | Regular expression to match and exclude release tag names.                | No       | (empty) | "^v0\\.1"                              |
| includes           | Regular expression to match and include release tag names.                | No       | (empty) | "^v1\\."                               |
| fallbackToTags     | Fall back to the latest tag when no releases are found                    | No       | false   | "true"                                 |
| groupBy            | Return the latest release per major, minor or patch group as a JSON array | No       | (empty) | "major"                                |
| token              | The GitHub token or personal access token                                 | No       | (empty) | `${{ secrets.GITHUB_TOKEN }}`          |

When `fallbackToTags` is enabled, repositories that do not publish releases -
for example
[anthropics/claude-code](https://github.com/anthropics/claude-code) - fall back
to the latest tag. In that case the `description` and `assetsUrl` outputs are
empty and `id` is the tag's commit SHA.

Using the `GITHUB_TOKEN` will avoid the action
[failing due to hitting API rate limits](https://github.com/ophiosdev/github-action-latest-release/issues/24)
from the IP address of the GitHub runner your action is running on. Using a
`PERSONAL_ACCESS_TOKEN` is required to get the release information from a
private repository. You can read about
[how to create a personal access token here](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)
and how to
[add this as a repository secret here](https://docs.github.com/en/github/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets).

### Outputs

<!-- textlint-disable terminology -->

| Name        | Description                         | Example                                                       |
| ----------- | ----------------------------------- | ------------------------------------------------------------- |
| release     | The latest release version tag      | v0.3.0                                                        |
| id          | The latest release version id       | 12345                                                         |
| description | The latest release description body | This is an example release                                    |
| url         | API URL for the latest release      | https://api.github.com/repos/owner/repo/releases/12345        |
| assetsUrl   | API URL for release assets          | https://api.github.com/repos/owner/repo/releases/12345/assets |

<!-- textlint-enable terminology -->

Set `groupBy` to `major`, `minor` or `patch` to return a JSON array of objects
with the latest release in each selected group, sorted newest first. `major`
groups by major, `minor` by major and minor, and `patch` by major, minor and
patch. An empty value (the default) disables grouping. The `release` output
contains the array; each object has the properties `release`, `id`,
`description`, `url` and `assetsUrl`, while the other outputs are not set.
For example, using `groupBy: major` with releases
`2.2.5, 2.2.0, 2.0.0, 1.19.5, 1.19.1, 1.18.0` returns one release per major:

```json
[
  {
    "release": "2.2.5",
    "id": "12345",
    "description": "Release body",
    "url": "https://api.github.com/repos/owner/repo/releases/12345",
    "assetsUrl": "https://api.github.com/repos/owner/repo/releases/12345/assets"
  },
  {
    "release": "1.19.5",
    "id": "12300",
    "description": "Release body",
    "url": "https://api.github.com/repos/owner/repo/releases/12300",
    "assetsUrl": "https://api.github.com/repos/owner/repo/releases/12300/assets"
  }
]
```

Use the array as a dynamic matrix to run a job once for each selected version
group. The `include` wrapper turns the returned array of objects into a GitHub
Actions matrix; each object's fields are available through the `matrix` context.

```yaml
jobs:
  get-releases:
    runs-on: ubuntu-latest
    outputs:
      releases: ${{ steps.releases.outputs.release }}
    steps:
      - id: releases
        uses: ophiosdev/github-action-latest-release@master
        with:
          repository: owner/repo
          groupBy: major

  use-releases:
    needs: get-releases
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJSON(format('{{"include":{0}}}', needs.get-releases.outputs.releases)) }}
    steps:
      - name: Use this major's latest release
        env:
          RELEASE: ${{ matrix.release }}
          RELEASE_ID: ${{ matrix.id }}
        run: echo "Latest release $RELEASE (ID $RELEASE_ID)"
```

## Usage Example

```yaml
name: Build Docker Images
on: [push, repository_dispatch]

jobs:
  build:
    name: RedisTimeSeries
    runs-on: ubuntu-latest
    steps:
      - id: keydb
        uses: ophiosdev/github-action-latest-release@master
        with:
          owner: JohnSully
          repo: KeyDB
          includeDrafts: false
          includePreReleases: false
          excludes: "-beta$"
          includes: "^v.*"

      - id: timeseries
        uses: ophiosdev/github-action-latest-release@master
        with:
          repository: RedisTimeSeries/RedisTimeSeries
          includeDrafts: true
          includePreReleases: false
      - uses: actions/checkout@v3

      - uses: docker/build-push-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
          repository: ophiosdev/keydb-timeseries
          dockerfile: timeseries.dockerfile
          build_args: KEY_DB_VERSION=${{ steps.keydb.outputs.release }},
            REDIS_TIME_SERIES_VERSION=${{ steps.timeseries.outputs.release }}
          tags: latest, ${{ steps.keydb.outputs.release }}_${{
            steps.timeseries.outputs.release }}
```

To use the current repository:

```yaml
with:
  repository: ${{ github.repository }}
```

To use authentication token:

```yaml
with:
  token: ${{ secrets.GITHUB_TOKEN }}
```

## How to Rebase

The `dist/` folder contains generated build artifacts. To prevent merge or
rebase conflicts on those files, they are marked in `.gitattributes` with
`-diff` and `merge=ours`. During a rebase or merge, `dist/` changes are never
conflicting and the version of the branch you are rebasing onto is kept
automatically.

One-time setup on your machine is required for the `merge=ours` driver:

```sh
git config --global merge.ours.driver true
```

Without this configuration, Git falls back to a regular three-way merge and
`dist/` files can conflict again. The `dist/` files of the branch you rebase
onto are generated from its `src/`, so keeping them is always the correct
choice.
