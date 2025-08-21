import { setFailed } from '@actions/core';

import { assignReviewers } from './assign.mts';

const run = async () => {
  try {
    const success = await assignReviewers();
    process.exit(success ? 0 : 1);
  } catch (err) {
    if (err instanceof Error) {
      setFailed(err);
    }
  }
};

run();
