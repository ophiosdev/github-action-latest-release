# GitHub Action - Get Latest Release

A simple Github action to get the latest release from another repository.

## Configuration

Example Repository - https://github.com/ophiosdev/github-action-latest-release

### Inputs

| Name               | Description                                                 | Required | Default | Example                                |
| ------------------ | ----------------------------------------------------------- | -------- | ------- | -------------------------------------- |
| repository         | The repository name in full                                 | Yes      | N/A     | ophiosdev/github-action-latest-release |
| includeDrafts      | Whether to include draft releases. Defaults to false.       | No       | false   | "true"                                 |
| includePreReleases | Whether to include pre-release versions. Defaults to false. | No       | false   | "true"                                 |
| excludes           | Regular expression to match and exclude release tag names.  | No       | (empty) | "^v0\\.1"                              |
| includes           | Regular expression to match and include release tag names.  | No       | (empty) | "^v1\\."                               |
| token              | The GitHub token or personal access token                   | No       | (empty) | `${{ secrets.GITHUB_TOKEN }}`          |

Using the `GITHUB_TOKEN` will avoid the action [failing due to hitting API rate limits](https://github.com/ophiosdev/github-action-latest-release/issues/24)
from the IP address of the GitHub runner your action is running on. Using a `PERSONAL_ACCESS_TOKEN` is required to get the release information from a
private repo. You can read about [how to create a personal access token here](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)
and how to [add this as a repository secret here](https://docs.github.com/en/github/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets).

### Outputs

| Name        | Description                         | Example                                                       |
| ----------- | ----------------------------------- | ------------------------------------------------------------- |
| release     | The latest release version tag      | v0.3.0                                                        |
| id          | The latest release version id       | 12345                                                         |
| description | The latest release description body | This is an example release                                    |
| url         | API URL for the latest release      | https://api.github.com/repos/owner/repo/releases/12345        |
| assetsUrl   | API URL for release assets          | https://api.github.com/repos/owner/repo/releases/12345/assets |

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
          build_args:
            KEY_DB_VERSION=${{ steps.keydb.outputs.release }},
            REDIS_TIME_SERIES_VERSION=${{ steps.timeseries.outputs.release }}
          tags:
            latest, ${{ steps.keydb.outputs.release }}_${{
            steps.timeseries.outputs.release }}
```

To use the current repo:

```yaml
with:
  repository: ${{ github.repository }}
```

To use authentication token:

```yaml
with:
  token: ${{ secrets.GITHUB_TOKEN }}
```
