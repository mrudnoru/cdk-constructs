import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface StaticSiteProps {
  /** Local build output dir to deploy via BucketDeployment. Omit to publish out-of-band. */
  readonly sitePath?: string;
  /** Custom domain names served by the distribution. Requires `certificate`. */
  readonly domainNames?: string[];
  /** ACM certificate (must be in us-east-1) covering `domainNames`. */
  readonly certificate?: acm.ICertificate;
  /** Hosted zone for A/AAAA alias records — one pair per domain name. Omit to manage DNS elsewhere. */
  readonly hostedZone?: route53.IHostedZone;
  /** Keep the bucket on stack delete. @default false — DESTROY + autoDeleteObjects */
  readonly retainBucket?: boolean;
  /** Serve index.html on 403/404 (SPA routing). @default true */
  readonly spa?: boolean;
  /** Log retention for the deployment lambda. @default ONE_WEEK */
  readonly logRetention?: logs.RetentionDays;
  /** Attached to the default behavior (e.g. a basic-auth CloudFront function). */
  readonly functionAssociations?: cloudfront.FunctionAssociation[];
  /** Attached to the default behavior. */
  readonly responseHeadersPolicy?: cloudfront.IResponseHeadersPolicy;
}

/**
 * Private S3 bucket behind a CloudFront distribution (OAC, HTTPS redirect,
 * SPA fallbacks), with optional custom domain + Route53 alias records and an
 * optional BucketDeployment. Extra behaviors: `distribution.addBehavior(...)`
 * at the call site.
 */
export class StaticSite extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps = {}) {
    super(scope, id);

    if (props.domainNames?.length && !props.certificate) {
      throw new Error('StaticSite: domainNames requires a certificate');
    }

    const retain = props.retainBucket ?? false;
    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: retain ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !retain,
    });

    const spa = props.spa ?? true;
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: props.functionAssociations,
        responseHeadersPolicy: props.responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
      domainNames: props.domainNames,
      certificate: props.certificate,
      errorResponses: spa
        ? [403, 404].map((httpStatus) => ({
            httpStatus,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: Duration.minutes(5),
          }))
        : undefined,
    });

    if (props.hostedZone) {
      const target = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      );
      for (const domain of props.domainNames ?? []) {
        const suffix = domain.replace(/[^A-Za-z0-9]/g, '');
        new route53.ARecord(this, `ARecord${suffix}`, {
          zone: props.hostedZone,
          recordName: domain,
          target,
        });
        new route53.AaaaRecord(this, `AaaaRecord${suffix}`, {
          zone: props.hostedZone,
          recordName: domain,
          target,
        });
      }
    }

    if (props.sitePath) {
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(props.sitePath)],
        destinationBucket: this.bucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        logGroup: new logs.LogGroup(this, 'DeploySiteLogs', {
          retention: props.logRetention ?? logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        memoryLimit: 256,
      });
    }

    new CfnOutput(this, 'Url', {
      value: `https://${props.domainNames?.[0] ?? this.distribution.distributionDomainName}`,
    });
  }
}
