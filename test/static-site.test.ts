import * as path from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { StaticSite, StaticSiteProps } from '../src/static-site';

const FIXTURE = path.join(__dirname, 'fixtures/site');

function makeStack(): Stack {
  return new Stack(new App(), 'Test', {
    env: { account: '111111111111', region: 'eu-west-1' },
  });
}

function template(stack: Stack, props: StaticSiteProps = {}): Template {
  new StaticSite(stack, 'Site', props);
  return Template.fromStack(stack);
}

describe('StaticSite', () => {
  it('creates a private bucket and an https-only distribution with SPA fallbacks by default', () => {
    const t = template(makeStack());
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ]),
      }),
    });
  });

  it('omits SPA fallbacks when spa is false', () => {
    template(makeStack(), { spa: false }).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ CustomErrorResponses: Match.absent() }),
    });
  });

  it('creates no bucket deployment without sitePath, one with it', () => {
    template(makeStack()).resourceCountIs('Custom::CDKBucketDeployment', 0);
    template(makeStack(), { sitePath: FIXTURE }).resourceCountIs('Custom::CDKBucketDeployment', 1);
  });

  it('wires domain names, certificate and A/AAAA alias records', () => {
    const stack = makeStack();
    const t = template(stack, {
      domainNames: ['app.example.com', 'www.app.example.com'],
      certificate: acm.Certificate.fromCertificateArn(
        stack,
        'Cert',
        'arn:aws:acm:us-east-1:111111111111:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ),
      hostedZone: route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', {
        hostedZoneId: 'Z0000000000000000000A',
        zoneName: 'example.com',
      }),
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['app.example.com', 'www.app.example.com'],
      }),
    });
    t.resourceCountIs('AWS::Route53::RecordSet', 4);
    t.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'app.example.com.', Type: 'A' });
    t.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'app.example.com.', Type: 'AAAA' });
  });

  it('throws on domainNames without a certificate', () => {
    expect(() => template(makeStack(), { domainNames: ['app.example.com'] })).toThrow(
      /certificate/,
    );
  });

  it('retains the bucket when retainBucket is set', () => {
    template(makeStack(), { retainBucket: true }).hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
    });
  });
});
