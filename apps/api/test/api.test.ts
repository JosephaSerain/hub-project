import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { ApiStack } from '../lib/api-stack';

describe('ApiStack', () => {
    const app = new cdk.App();
    const stack = new ApiStack(app, 'TestStack');
    const template = Template.fromStack(stack);   // synthétise la stack en mémoire

    it('crée une table DynamoDB facturée à la requête', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            BillingMode: 'PAY_PER_REQUEST',
        });
    });

    it('crée les 4 Lambdas, toutes en Node 24', () => {
        template.resourceCountIs('AWS::Lambda::Function', 4);
        template.allResourcesProperties('AWS::Lambda::Function', {
            Runtime: 'nodejs24.x',
        });
    });
});