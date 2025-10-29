#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { GenaiStack } from '../lib/genai-stack';

import * as dotenv from 'dotenv';
dotenv.config();

const app = new cdk.App();
new GenaiStack(app, 'GenaiStack', {
  vpcCidr: process.env.VPC_CIDR!,  // Get VPC CIDR from .env
  instanceType: process.env.INSTANCE_TYPE!,  // Get EC2 instance type from .env
  dbEngine: process.env.DB_ENGINE!,  // Get DB engine (postgres/mysql)
  dbStorage: parseInt(process.env.DB_STORAGE!),  // Get DB storage in GB
  dbInstanceType: process.env.DB_INSTANCE_TYPE!,  // Get DB instance type
  dbAdminUsername: process.env.DB_ADMIN_USERNAME!,  // Get DB admin username
  dbAdminPassword: process.env.DB_ADMIN_PASSWORD!,  // Get DB admin password
  desiredCapacity: parseInt(process.env.DESIRED_CAPACITY!),  // Get ASG desired capacity
  minCapacity: parseInt(process.env.MIN_CAPACITY!),  // Get ASG min capacity
  maxCapacity: parseInt(process.env.MAX_CAPACITY!),  // Get ASG max capacity
  env: { account: '564395526804', region: 'ca-central-1' },

});