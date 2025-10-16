# assign

GitHub Action to assign reviewers when dependencies are changed using [dependency-owners](https://github.com/dependency-owners/dependency-owners).

## Usage

See [action.yml](action.yml)

```yaml
- uses: dependency-owners/check@v2
  with:
    # Path to the configuration file. Default: 'dependency-owners.json'
    config-file: ''

    # Path to the dependency file.
    dependency-file: ''

    # GitHub token for authentication. Default: ${{ github.token }}
    github-token: ''

    # Loader to use for loading dependencies.
    loader: ''
```

## Required Permissions

To successfully assign reviewers to pull requests, this action requires write access for pull requests:

```yaml
permissions:
  pull-requests: write
```
