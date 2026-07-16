#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { RamseyStack } from '../lib/ramsey-stack.js';

const app = new App();

new RamseyStack(app, 'RamseyProduction', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-central-1',
  },
  description: 'RAMSey production API, worker, database, cache, and deployment identity',
});
