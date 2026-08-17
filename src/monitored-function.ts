import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaDest from 'aws-cdk-lib/aws-lambda-destinations';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface MonitoredFunctionProps
  extends Omit<nodejs.NodejsFunctionProps, 'logGroup' | 'logRetention' | 'onFailure'> {
  /** Log retention. @default ONE_MONTH */
  readonly retention?: logs.RetentionDays;
  /** Create a side-car SQS DLQ wired to onFailure (async invocations only). @default false */
  readonly withDlq?: boolean;
}

/**
 * NodejsFunction with an explicit retention-bounded log group and an optional
 * side-car DLQ. Alarms stay at the stack level — this construct only makes
 * sure failures and logs are captured and bounded.
 */
export class MonitoredFunction extends Construct {
  public readonly fn: nodejs.NodejsFunction;
  public readonly logGroup: logs.LogGroup;
  public readonly dlq?: sqs.Queue;

  constructor(scope: Construct, id: string, props: MonitoredFunctionProps = {}) {
    super(scope, id);

    const { retention, withDlq, ...fnProps } = props;

    this.logGroup = new logs.LogGroup(this, 'Logs', {
      retention: retention ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    if (withDlq) {
      this.dlq = new sqs.Queue(this, 'Dlq', {
        retentionPeriod: Duration.days(14),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
      });
    }

    this.fn = new nodejs.NodejsFunction(this, 'Fn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      ...fnProps,
      logGroup: this.logGroup,
      onFailure: this.dlq ? new lambdaDest.SqsDestination(this.dlq) : undefined,
    });
  }
}
