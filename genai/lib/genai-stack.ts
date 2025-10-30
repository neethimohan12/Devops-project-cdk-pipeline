import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as fs from 'fs';

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
    const dbInstanceType = envConfig.dbInstanceType;
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

    // Application Load Balancer Security Group (ALB)
    const albSG = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Allow HTTP and HTTPS traffic from the internet to ALB',
      allowAllOutbound: true,  // Allow all outbound traffic
    });

    // Inbound Rules: Allow HTTP (80) and HTTPS (443) from the internet
    albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
    albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic');

    // EC2 Security Group
    const ec2SG = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc,
      description: 'Allow traffic only from ALB security group on ports 80/443',
      allowAllOutbound: true,  // Allow all outbound traffic
    });

    // Inbound Rules: Allow traffic only from ALB security group on port 80/443
    ec2SG.addIngressRule(albSG, ec2.Port.tcp(80), 'Allow HTTP traffic from ALB');
    ec2SG.addIngressRule(albSG, ec2.Port.tcp(443), 'Allow HTTPS traffic from ALB');

    // RDS Database Security Group
    const dbSG = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow traffic only from EC2 instances on database port',
      allowAllOutbound: false,  // Restrict outbound traffic
    });

    // Inbound Rules: Allow traffic only from EC2 instances on port 3306 (MySQL) or 5432 (PostgreSQL)
    dbSG.addIngressRule(ec2.Peer.securityGroupId(ec2SG.securityGroupId), ec2.Port.tcp(3306), 'Allow MySQL traffic from EC2 instances');  // For MySQL
    // or
    // dbSG.addIngressRule(ec2.Peer.securityGroupId(ec2SG.securityGroupId), ec2.Port.tcp(5432), 'Allow PostgreSQL traffic from EC2 instances');  // For PostgreSQL

    // EC2 instance configuration using envConfig
    const ec2Instance = new ec2.Instance(this, 'GenaiInstance', {
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      securityGroup: ec2SG,  // Attach the EC2 Security Group
    });

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, `GenaiALB-${envName}`, {
      vpc,
      internetFacing: true,
      securityGroup: albSG,  // Attach the ALB Security Group
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
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
      securityGroups: [dbSG],  // Attach the RDS Security Group
    });

    // Output the EC2 instance and DB instance IDs
    new cdk.CfnOutput(this, 'Ec2InstanceId', { value: ec2Instance.instanceId });
    new cdk.CfnOutput(this, 'DbInstanceEndpoint', { value: rdsInstance.dbInstanceEndpointAddress });

    // Auto Scaling Group (ASG) based on EC2 instance configuration
    const asg = new autoscaling.AutoScalingGroup(this, 'GenaiASG', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      minCapacity: minCapacity,
      maxCapacity: maxCapacity,
      desiredCapacity: desiredCapacity,
      securityGroup: ec2SG,  // Attach the EC2 Security Group to the ASG
    });

    // Output ASG ID
    new cdk.CfnOutput(this, 'AutoScalingGroupId', { value: asg.autoScalingGroupName });
  }
}
