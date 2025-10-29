#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { GenaiStack } from '../lib/genai-stack';

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Get environment name (default to 'dev')
const envName = process.env.DEPLOY_ENV || 'dev';
const envConfig = config[envName];

if (!envConfig) {
  throw new Error(`Configuration for environment "${envName}" is missing in config.json.`);
}

// Create a new CDK app and pass the environment-specific configuration
const app = new cdk.App();

new GenaiStack(app, 'GenaiStack', {
  vpcCidr: envConfig.vpcCidr,
  instanceType: envConfig.instanceType,
  dbEngine: envConfig.dbEngine,
  dbStorage: envConfig.dbStorage,
  dbInstanceType: envConfig.dbInstanceType,
  dbAdminUsername: envConfig.dbAdminUsername,
  dbAdminPassword: envConfig.dbAdminPassword,
  desiredCapacity: envConfig.desiredCapacity,
  minCapacity: envConfig.minCapacity,
  maxCapacity: envConfig.maxCapacity,
  env: { account: '564395526804', region: 'ca-central-1' },
});
