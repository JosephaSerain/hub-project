import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

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

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}