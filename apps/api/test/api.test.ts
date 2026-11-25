import * as cdk from 'aws-cdk-lib/core';
import { ApiStack } from '../lib/api-stack';
import { Match, Template } from 'aws-cdk-lib/assertions';


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
        template.resourceCountIs('AWS::Lambda::Function', 9);
        template.allResourcesProperties('AWS::Lambda::Function', {
            Runtime: 'nodejs24.x',
        });
    });
    it('crée la table avec les index GSI1 et GSI2', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            KeySchema: [
                { AttributeName: 'PK', KeyType: 'HASH' },
                { AttributeName: 'SK', KeyType: 'RANGE' },
            ],
            GlobalSecondaryIndexes: [
                Match.objectLike({ IndexName: 'GSI1' }),
                Match.objectLike({ IndexName: 'GSI2' }),
            ],
        });
    });
    test('La table publie un stream et expire les éléments via expireLe', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TimeToLiveSpecification: { AttributeName: 'expireLe', Enabled: true },
        });
        template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
            StartingPosition: 'LATEST',
            FunctionResponseTypes: ['ReportBatchItemFailures'],
            FilterCriteria: Match.anyValue(),
        });
    });
});

