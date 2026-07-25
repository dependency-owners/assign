import { getInput, info, setOutput } from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { getOctokit } from '@actions/github';
import {
  dependencyOwners,
  type DependencyOwnersOptions,
} from 'dependency-owners';
import { Dependency, resolveDependencyLoader } from 'dependency-owners/loader';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Find the changes between the baseDeps and the currentDeps
function diffDependencies(
  baseDeps: Dependency[],
  currentDeps: Dependency[]
): string[] {
  const baseMap = new Map(baseDeps.map((dep) => [dep.name, dep]));
  const currentMap = new Map(currentDeps.map((dep) => [dep.name, dep]));

  const added = currentDeps.filter((dep) => !baseMap.has(dep.name));
  const removed = baseDeps.filter((dep) => !currentMap.has(dep.name));
  const changed = currentDeps.filter((dep) => {
    const baseDep = baseMap.get(dep.name);
    return baseDep && baseDep.version !== dep.version;
  });

  return [...added, ...removed, ...changed].map((dep) => dep.name);
}

/**
 * Assigns reviewers to changed dependencies using dependency-owners.
 * @returns True if reviewers were successfully assigned, false otherwise.
 */
export async function assignReviewers(): Promise<boolean> {
  // Inputs
  const configFile = getInput('config-file');
  const dependencyFile = getInput('dependency-file', { required: true });
  const githubToken = getInput('github-token');
  const loaderInput = getInput('loader', { required: true });

  // Get GitHub event information
  const githubEvent = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH!, 'utf-8')
  );

  // Check if the event is a pull request
  const { pull_request: pullRequest, repository } = githubEvent;
  if (!pullRequest) {
    info('No pull request found');
    setOutput('reviewers', []);
    return true;
  }

  // Get pull request and repository information
  const baseRef = pullRequest.base.ref;
  const repo = repository.name;
  const owner = repository.owner.login;
  const pullNumber = pullRequest.number;
  const excludedReviewers = [
    ...pullRequest.requested_reviewers,
    pullRequest.user.login,
  ];

  // Determine paths for loader resolution
  const paths = [];
  if (process.env.GITHUB_WORKSPACE) {
    paths.push(process.env.GITHUB_WORKSPACE);
  }

  // Resolve dependency loader
  const loaderPath = require.resolve(loaderInput, { paths });
  const loader = await resolveDependencyLoader(loaderPath, dependencyFile);
  if (!loader) {
    throw new Error('Failed to resolve dependency loader');
  }

  // Load dependencies from current branch
  const currentDeps = await loader.load(dependencyFile);

  // Read dependencies from base branch and save to temp file
  const baseRefPath = `${baseRef}:${dependencyFile}`;
  const tmpFilePath = join(process.env.RUNNER_TEMP!, dependencyFile);
  await exec('git', ['fetch', 'origin', baseRef]);
  const output = await getExecOutput('git', ['show', `origin/${baseRefPath}`], {
    silent: true,
  });
  await writeFile(tmpFilePath, output.stdout, 'utf-8');

  // Load dependencies from base branch
  const baseDeps = await loader.load(tmpFilePath);

  // Find the changes between the baseDeps and the currentDeps
  const dependencies = diffDependencies(baseDeps, currentDeps);

  // Check if there are any changed dependencies
  if (dependencies.length === 0) {
    info('No changed dependencies found');
    setOutput('reviewers', []);
    return true;
  }

  // Build options for dependency-owners
  const options: DependencyOwnersOptions = {
    configFile,
    dependencies,
    dependencyFile,
    loader,
  };

  // Run dependency-owners
  const results = await dependencyOwners(options);

  // Filter out excluded reviewers
  const reviewersSet = new Set(Object.values(results).flat());
  for (const reviewer of excludedReviewers) {
    reviewersSet.delete(reviewer);
  }

  // Request reviewers if they exist
  const reviewers = Array.from(reviewersSet);
  if (reviewers.length > 0) {
    const octokit = getOctokit(githubToken);
    await octokit.rest.pulls.requestReviewers({
      reviewers,
      owner,
      repo,
      pull_number: pullNumber,
    });
  } else {
    info('No reviewers found for changed dependencies');
  }

  setOutput('reviewers', reviewers);
  return true;
}
