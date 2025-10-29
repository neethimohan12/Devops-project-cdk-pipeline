import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as fs from 'fs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

// Define custom properties for the stack (extend from StackProps)
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

    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const envName = process.env.DEPLOY_ENV || 'dev';
    const envConfig = config[envName];

    const vpcCidr = envConfig.vpcCidr;
    const instanceType = envConfig.instanceType;
    const dbEngine = envConfig.dbEngine;
    const dbStorage = envConfig.dbStorage;
    const dbInstanceType = envConfig.dbInstanceType;
    const desiredCapacity = envConfig.desiredCapacity;
    const minCapacity = envConfig.minCapacity;
    const maxCapacity = envConfig.maxCapacity;

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

    // Output the VPC and Subnets
    new cdk.CfnOutput(this, 'VpcIdOutput', {
      value: vpc.vpcId,
      description: 'The ID of the VPC',
      exportName: 'CUSTOM-VPC-CANADA',
    });

    // EC2 instance configuration
    const ec2Instance = new ec2.Instance(this, 'GenaiInstance', {
      instanceType: new ec2.InstanceType(props.instanceType),  // Using the 'instanceType' from props
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      vpc,
      securityGroup: new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
        vpc,
      }),
    });

    // Create RDS Database instance with credentials from secrets manager
    const dbCredentials = new secretsmanager.Secret(this, 'DbCredentials', {
      secretName: 'genai-db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: props.dbAdminUsername,  // Using 'dbAdminUsername' from props
          password: props.dbAdminPassword,  // Using 'dbAdminPassword' from props
        }),
        generateStringKey: 'password',  // This generates a password automatically if you don't provide one
      },
    });

    const rdsInstance = new rds.DatabaseInstance(this, 'GenaiDb', {
      vpc,
      instanceType: new ec2.InstanceType(props.dbInstanceType),  // Using 'dbInstanceType' from props
      engine: dbEngine === 'postgres'
        ? rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_4 })
        : rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_23 }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: props.dbStorage,  // Using 'dbStorage' from props
      multiAz: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [new ec2.SecurityGroup(this, 'DbSecurityGroup', { vpc })],
    });

    // Output the EC2 instance and DB instance IDs
    new cdk.CfnOutput(this, 'Ec2InstanceId', { value: ec2Instance.instanceId });
    new cdk.CfnOutput(this, 'DbInstanceEndpoint', { value: rdsInstance.dbInstanceEndpointAddress });

    // Create Auto Scaling Group (ASG) based on EC2 instance
    const asg = new autoscaling.AutoScalingGroup(this, 'GenaiASG', {
      vpc,
      instanceType: new ec2.InstanceType(props.instanceType),  // Using 'instanceType' from props
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      minCapacity: props.minCapacity,  // Using 'minCapacity' from props
      maxCapacity: props.maxCapacity,  // Using 'maxCapacity' from props
      desiredCapacity: props.desiredCapacity,  // Using 'desiredCapacity' from props
    });

    // Output ASG ID
    new cdk.CfnOutput(this, 'AutoScalingGroupId', { value: asg.autoScalingGroupName });
  }
}
