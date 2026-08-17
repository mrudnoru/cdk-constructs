import * as path from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { describe, expect, it } from 'vitest';
import { MonitoredFunction, MonitoredFunctionProps } from '../src/monitored-function';

const ENTRY = path.join(__dirname, 'fixtures/handler.ts');

function template(props: Partial<MonitoredFunctionProps> = {}): Template {
  const stack = new Stack(new App(), 'Test', {
    env: { account: '111111111111', region: 'eu-west-1' },
  });
  new MonitoredFunction(stack, 'Job', { entry: ENTRY, ...props });
  return Template.fromStack(stack);
}

describe('MonitoredFunction', () => {
  it('creates an explicit log group with one-month retention by default', () => {
    const t = template();
    t.resourceCountIs('AWS::Logs::LogGroup', 1);
    t.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('honors a custom retention', () => {
    template({ retention: logs.RetentionDays.ONE_WEEK }).hasResourceProperties(
      'AWS::Logs::LogGroup',
      { RetentionInDays: 7 },
    );
  });

  it('creates no DLQ by default', () => {
    template().resourceCountIs('AWS::SQS::Queue', 0);
  });

  it('wires an SQS DLQ to onFailure when withDlq is set', () => {
    const t = template({ withDlq: true });
    t.hasResourceProperties('AWS::SQS::Queue', { MessageRetentionPeriod: 1209600 });
    t.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      DestinationConfig: { OnFailure: { Destination: Match.anyValue() } },
    });
  });

  it('passes NodejsFunction props through', () => {
    template({ memorySize: 512 }).hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
    });
  });
});
