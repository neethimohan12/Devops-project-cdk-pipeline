import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as fs from 'fs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

// Custom StackProps interface without `envName`
interface GenaiStackProps extends cdk.StackProps {
  vpcCidr: string;
  instanceType: string;
  dbEngine: string;
  dbStorage: number;
  dbInstanceType: string;
  dbAdminUsername: string;
  dbAdminPassword: string;
  desiredCapacity: number;
  minCapacity: number;
  maxCapacity: number;
}

export class GenaiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GenaiStackProps) {
    super(scope, id, props);

    // Load config.json file
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

    // Get environment name (default to 'dev')
    const envName = process.env.DEPLOY_ENV || 'dev';
    const envConfig = config[envName]; // Fetch the environment-specific configuration

    if (!envConfig) {
      throw new Error(`Configuration for environment "${envName}" is missing in config.json.`);
    }

    // Extract variables from the environment-specific config
    const vpcCidr = envConfig.vpcCidr;
    const instanceType = envConfig.instanceType;
    const dbEngine = envConfig.dbEngine;
    const dbStorage = envConfig.dbStorage;
    const dbInstanceType = envConfig.dbInstanceType 
    const desiredCapacity = envConfig.desiredCapacity;
    const minCapacity = envConfig.minCapacity;
    const maxCapacity = envConfig.maxCapacity;
    const dbAdminUsername = envConfig.dbAdminUsername;
    const dbAdminPassword = envConfig.dbAdminPassword;

    // Deploy custom VPC
    const vpc = new ec2.Vpc(this, 'TheVPC', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Output the VPC and Subnets with a unique export name
    new cdk.CfnOutput(this, 'VpcIdOutput', {
      value: vpc.vpcId,
      description: 'The ID of the VPC',
      exportName: `CUSTOM-VPC-${envName}`,
    });

    // EC2 instance configuration using envConfig
    const ec2Instance = new ec2.Instance(this, 'GenaiInstance', {
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      securityGroup: new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
        vpc,
      }),
    });

    // Create RDS Database instance with provided credentials
    const rdsInstance = new rds.DatabaseInstance(this, 'GenaiDb', {
      vpc,
      instanceType: new ec2.InstanceType(dbInstanceType),
      engine: dbEngine === 'postgres'
        ? rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_22 })
        : rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_23 }),
      credentials: rds.Credentials.fromUsername(dbAdminUsername, {
        password: cdk.SecretValue.plainText(dbAdminPassword),
      }),
      allocatedStorage: dbStorage,
      multiAz: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [new ec2.SecurityGroup(this, 'DbSecurityGroup', { vpc })],
    });

    // Output the EC2 instance and DB instance IDs
    new cdk.CfnOutput(this, 'Ec2InstanceId', { value: ec2Instance.instanceId });
    new cdk.CfnOutput(this, 'DbInstanceEndpoint', { value: rdsInstance.dbInstanceEndpointAddress });

    // Create Auto Scaling Group (ASG) based on EC2 instance configuration
    const asg = new autoscaling.AutoScalingGroup(this, 'GenaiASG', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      minCapacity: minCapacity,
      maxCapacity: maxCapacity,
      desiredCapacity: desiredCapacity,
    });

    // Output ASG ID
    new cdk.CfnOutput(this, 'AutoScalingGroupId', { value: asg.autoScalingGroupName });
  }
}