import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Aws,
  CfnOutput,
  CfnParameter,
  Duration,
  IgnoreMode,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');

const FRONTEND_ORIGIN = 'https://ramseytools.com';
const API_ORIGIN = 'https://api.ramseytools.com';
const CONTAINER_PORT = 3000;
// Keep in sync with https://www.cloudflare.com/ips-v4/. The ALB accepts only
// Cloudflare edges, and Fastify trusts the same chain for per-client rate limits.
const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const;

export class RamseyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('Application', 'RAMSey');
    Tags.of(this).add('Environment', 'production');

    const certificateArn = new CfnParameter(this, 'CertificateArn', {
      type: 'String',
      description: 'ACM certificate ARN for api.ramseytools.com in eu-central-1',
      allowedPattern: '^arn:[^:]+:acm:eu-central-1:[0-9]{12}:certificate/.+$',
    });
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'ApiCertificate',
      certificateArn.valueAsString,
    );

    // Public tasks avoid a permanently billed NAT gateway. Security groups
    // still make the API reachable only through the load balancer; data stays private.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public-compute', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private-data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'LoadBalancerSecurityGroup', {
      vpc,
      description: 'Public HTTPS ingress for the RAMSey API',
      allowAllOutbound: true,
    });
    for (const cidr of CLOUDFLARE_IPV4_CIDRS) {
      const peer = ec2.Peer.ipv4(cidr);
      loadBalancerSecurityGroup.addIngressRule(peer, ec2.Port.tcp(80), 'Cloudflare HTTP');
      loadBalancerSecurityGroup.addIngressRule(peer, ec2.Port.tcp(443), 'Cloudflare HTTPS');
    }

    const apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSecurityGroup', {
      vpc,
      description: 'API traffic from the load balancer only',
      allowAllOutbound: true,
    });
    apiSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcp(CONTAINER_PORT),
      'ALB to API',
    );

    const workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc,
      description: 'Outbound-only solver worker',
      allowAllOutbound: true,
    });
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'PostgreSQL from application tasks only',
      allowAllOutbound: false,
    });
    databaseSecurityGroup.addIngressRule(apiSecurityGroup, ec2.Port.tcp(5432), 'API to Postgres');
    databaseSecurityGroup.addIngressRule(
      workerSecurityGroup,
      ec2.Port.tcp(5432),
      'Worker to Postgres',
    );

    const cacheSecurityGroup = new ec2.SecurityGroup(this, 'CacheSecurityGroup', {
      vpc,
      description: 'Valkey from the API only',
      allowAllOutbound: false,
    });
    cacheSecurityGroup.addIngressRule(apiSecurityGroup, ec2.Port.tcp(6379), 'API to Valkey');

    const databaseCredentials = new secretsmanager.Secret(this, 'DatabaseCredentials', {
      secretName: 'ramsey/production/database',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'ramsey' }),
        generateStringKey: 'password',
        passwordLength: 32,
        excludePunctuation: true,
      },
    });
    databaseCredentials.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      databaseName: 'ramsey',
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      backupRetention: Duration.days(7),
      autoMinorVersionUpgrade: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    const cache = new elasticache.CfnServerlessCache(this, 'Cache', {
      engine: 'valkey',
      serverlessCacheName: 'ramsey-production',
      description: 'Transient distributed rate-limit counters',
      subnetIds: vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      securityGroupIds: [cacheSecurityGroup.securityGroupId],
      cacheUsageLimits: {
        dataStorage: { minimum: 1, maximum: 1, unit: 'GB' },
        ecpuPerSecond: { minimum: 1000, maximum: 1000 },
      },
      snapshotRetentionLimit: 0,
    });
    cache.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const applicationSecrets = new secretsmanager.Secret(this, 'ApplicationSecrets', {
      secretName: 'ramsey/production/application',
      description: 'RAMSey JWT and third-party service credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          SMTP_PASS: 'REPLACE_WITH_RESEND_API_KEY',
          GOOGLE_CLIENT_ID: '',
          GOOGLE_CLIENT_SECRET: '',
          ANTHROPIC_API_KEY: '',
          SENTRY_DSN: '',
        }),
        generateStringKey: 'JWT_SECRET',
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    applicationSecrets.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'ramsey-production',
    });
    const imageAsset = new ecrAssets.DockerImageAsset(this, 'BackendImage', {
      directory: repositoryRoot,
      file: 'docker/backend/Dockerfile',
      ignoreMode: IgnoreMode.DOCKER,
    });
    const image = ecs.ContainerImage.fromDockerImageAsset(imageAsset);

    const apiLogs = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: '/ramsey/production/api',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const workerLogs = new logs.LogGroup(this, 'WorkerLogs', {
      logGroupName: '/ramsey/production/worker',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const commonEnvironment: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: String(CONTAINER_PORT),
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_PORT: database.dbInstanceEndpointPort,
      DB_NAME: 'ramsey',
      REDIS_URL: `rediss://${cache.attrEndpointAddress}:${cache.attrEndpointPort}`,
      CORS_ORIGIN: FRONTEND_ORIGIN,
      FRONTEND_URL: FRONTEND_ORIGIN,
      PUBLIC_API_URL: API_ORIGIN,
      TRUST_PROXY: ['10.42.0.0/16', ...CLOUDFLARE_IPV4_CIDRS].join(','),
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: '465',
      SMTP_USER: 'resend',
      SMTP_FROM: 'RAMSey <no-reply@mail.ramseytools.com>',
    };
    const commonSecrets: Record<string, ecs.Secret> = {
      DB_USER: ecs.Secret.fromSecretsManager(databaseCredentials, 'username'),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(databaseCredentials, 'password'),
      JWT_SECRET: ecs.Secret.fromSecretsManager(applicationSecrets, 'JWT_SECRET'),
      SMTP_PASS: ecs.Secret.fromSecretsManager(applicationSecrets, 'SMTP_PASS'),
      GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(applicationSecrets, 'GOOGLE_CLIENT_ID'),
      GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(
        applicationSecrets,
        'GOOGLE_CLIENT_SECRET',
      ),
      ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(applicationSecrets, 'ANTHROPIC_API_KEY'),
      SENTRY_DSN: ecs.Secret.fromSecretsManager(applicationSecrets, 'SENTRY_DSN'),
    };
    const databaseUrl =
      'postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&sslmode=require';

    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    const apiContainer = apiTask.addContainer('api', {
      image,
      environment: commonEnvironment,
      secrets: commonSecrets,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup: apiLogs }),
      command: [
        'sh',
        '-c',
        `export DATABASE_URL="${databaseUrl}"; node packages/backend/node_modules/prisma/build/index.js migrate deploy --schema=packages/backend/prisma/schema.prisma && exec node packages/backend/dist/index.js`,
      ],
      healthCheck: {
        command: [
          'CMD-SHELL',
          `node -e "fetch('http://127.0.0.1:${CONTAINER_PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });
    apiContainer.addPortMappings({ containerPort: CONTAINER_PORT, protocol: ecs.Protocol.TCP });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      serviceName: 'ramsey-api',
      taskDefinition: apiTask,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [apiSecurityGroup],
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(120),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    apiService.node.addDependency(database, cache);

    const workerTask = new ecs.FargateTaskDefinition(this, 'WorkerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    workerTask.addContainer('worker', {
      image,
      environment: commonEnvironment,
      secrets: commonSecrets,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker', logGroup: workerLogs }),
      command: [
        'sh',
        '-c',
        `export DATABASE_URL="${databaseUrl}"; exec node packages/backend/dist/worker/solver-worker.js`,
      ],
    });
    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      serviceName: 'ramsey-worker',
      taskDefinition: workerTask,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [workerSecurityGroup],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    workerService.node.addDependency(database);

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: loadBalancerSecurityGroup,
      idleTimeout: Duration.minutes(60),
    });
    loadBalancer.addListener('HttpListener', {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });
    const httpsListener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      open: false,
      certificates: [certificate],
    });
    httpsListener.addTargets('ApiTargets', {
      port: CONTAINER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [
        apiService.loadBalancerTarget({ containerName: 'api', containerPort: CONTAINER_PORT }),
      ],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: '/api/health/ready',
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
      },
    });

    // One API replica is intentional: Yjs awareness is process-local. Scale only
    // after adding a shared awareness provider and load-balancer stickiness.
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const githubDeployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'ramsey-github-deploy',
      description: 'Short-lived CDK deployment role for the master branch',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': 'repo:szilagyib/RAMSey:ref:refs/heads/master',
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-*`],
      }),
    );
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/cdk-bootstrap/*`,
        ],
      }),
    );

    new CfnOutput(this, 'ApiLoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'Cloudflare CNAME target for api.ramseytools.com',
    });
    new CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable',
    });
    new CfnOutput(this, 'ApplicationSecretName', {
      value: 'ramsey/production/application',
      description: 'Replace only SMTP_PASS with the saved Resend API key',
    });
  }
}
