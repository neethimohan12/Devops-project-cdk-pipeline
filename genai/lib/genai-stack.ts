import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

interface GenaiStackProps extends cdk.StackProps {
  vpcCidr: string;  // The CIDR block for the VPC
  instanceType: string;  // EC2 instance type
  dbEngine: string;  // Database engine (postgres/mysql)
  dbStorage: number;  // Database storage size in GB
  dbInstanceType: string;  // RDS instance type
  dbAdminUsername: string;  // DB admin username
  dbAdminPassword: string;  // DB admin password
  desiredCapacity: number;  // ASG desired capacity
  minCapacity: number;  // ASG min capacity
  maxCapacity: number;  // ASG max capacity
}

export class GenaiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GenaiStackProps) {
    super(scope, id, props);

    // Deploy custom VPC
    const vpc = new ec2.Vpc(this, 'TheVPC', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
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
    const instanceType = new ec2.InstanceType(props.instanceType);  // Get from .env
    const ec2Instance = new ec2.Instance(this, 'GenaiInstance', {
      instanceType,
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      vpc,
      securityGroup: new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
        vpc,
      }),
    });

    // Create RDS Database instance
    const dbCredentials = new secretsmanager.Secret(this, 'DbCredentials', {
      secretName: 'genai-db-credentials',
      generateSecretString: {
      secretStringTemplate: JSON.stringify({
        username: props.dbAdminUsername,  // Get username from .env
        password: props.dbAdminPassword,  // Get password from .env
      }),
      },
    });

    const rdsInstance = new rds.DatabaseInstance(this, 'GenaiDb', {
      vpc,
      instanceType: new ec2.InstanceType(props.dbInstanceType),  // Get from .env
      engine: props.dbEngine === 'postgres'
        ? rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_12_4 })
        : rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_23 }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: props.dbStorage,
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
      instanceType: instanceType,
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity,
      desiredCapacity: props.desiredCapacity,
    });

    // Output ASG ID
    new cdk.CfnOutput(this, 'AutoScalingGroupId', { value: asg.autoScalingGroupName });
  }
}
