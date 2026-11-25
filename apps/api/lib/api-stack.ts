import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const helloFn = new NodejsFunction(this, 'HelloFunction', {
      entry: path.join(__dirname, '../src/handlers/hello.ts'),
      runtime: Runtime.NODEJS_24_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
    });

    const api = new HttpApi(this, 'DevHubApi');
    api.addRoutes({
      path: '/hello',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HelloIntegration', helloFn),
    });

    // La table unique, avec PK / SK et deux index
    const table = new Table(this, 'DevHubTable', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: AttributeType.STRING },
    });

    const environment = { TABLE_NAME: table.tableName };
    const lambda = (id: string, fichier: string) =>
      new NodejsFunction(this, id, {
        entry: path.join(__dirname, `../src/handlers/${fichier}`),
        runtime: Runtime.NODEJS_24_X,
        environment,
      });

    const createFn = lambda('CreateServiceFunction', 'services/create.ts');
    const getFn = lambda('GetServiceFunction', 'services/get.ts');
    const listTeamServicesFn = lambda('ListTeamServicesFunction', 'teams/list-services.ts');

    table.grantWriteData(createFn);
    table.grantReadData(getFn);
    table.grantReadData(listTeamServicesFn);   // couvre aussi les index (GSI)

    api.addRoutes({
      path: '/services',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateServiceIntegration', createFn),
    });
    api.addRoutes({
      path: '/services/{id}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetServiceIntegration', getFn),
    });
    api.addRoutes({
      path: '/teams/{equipe}/services',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListTeamServicesIntegration', listTeamServicesFn),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });

    const createDeploymentFn = lambda('CreateDeploymentFunction', 'deployments/create.ts');
    const listDeploymentsFn = lambda('ListDeploymentsFunction', 'deployments/list.ts');

    table.grantWriteData(createDeploymentFn);
    table.grantReadData(listDeploymentsFn);

    api.addRoutes({
      path: '/services/{id}/deployments',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateDeploymentIntegration', createDeploymentFn),
    });
    api.addRoutes({
      path: '/services/{id}/deployments',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListDeploymentsIntegration', listDeploymentsFn),
    });

    const updateStatusFn = lambda('UpdateServiceStatusFunction', 'services/update-status.ts');
    const listStatusServicesFn = lambda('ListStatusServicesFunction', 'statuses/list-services.ts');

    table.grantWriteData(updateStatusFn);
    table.grantReadData(listStatusServicesFn);

    api.addRoutes({
      path: '/services/{id}/statut',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('UpdateServiceStatusIntegration', updateStatusFn),
    });
    api.addRoutes({
      path: '/statuts/{statut}/services',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListStatusServicesIntegration', listStatusServicesFn),
    });
  }
}