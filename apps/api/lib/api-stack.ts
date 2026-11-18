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

    // La "mémoire" : la table DynamoDB
    const table = new Table(this, 'ServicesTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,      // on paie à la requête (on-demand)
      removalPolicy: cdk.RemovalPolicy.DESTROY,      // supprimée avec cdk destroy (projet d'apprentissage)
    });

    const environment = { TABLE_NAME: table.tableName };

    const createFn = new NodejsFunction(this, 'CreateServiceFunction', {
      entry: path.join(__dirname, '../src/handlers/services/create.ts'),
      runtime: Runtime.NODEJS_24_X,
      environment,
    });
    const listFn = new NodejsFunction(this, 'ListServicesFunction', {
      entry: path.join(__dirname, '../src/handlers/services/list.ts'),
      runtime: Runtime.NODEJS_24_X,
      environment,
    });
    const getFn = new NodejsFunction(this, 'GetServiceFunction', {
      entry: path.join(__dirname, '../src/handlers/services/get.ts'),
      runtime: Runtime.NODEJS_24_X,
      environment,
    });

    // Le moindre privilège : chaque Lambda n'a QUE les droits dont elle a besoin
    table.grantWriteData(createFn);
    table.grantReadData(listFn);
    table.grantReadData(getFn);

    api.addRoutes({
      path: '/services',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateServiceIntegration', createFn),
    });
    api.addRoutes({
      path: '/services',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListServicesIntegration', listFn),
    });
    api.addRoutes({
      path: '/services/{id}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetServiceIntegration', getFn),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}