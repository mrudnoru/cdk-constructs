# @marmaid/cdk-constructs

Shared AWS CDK constructs for marmaid projects. Extracts the three patterns
every repo was rewriting by hand: GitHub OIDC deploy role, static site
hosting, monitored Lambda.

## Purpose

Six CDK apps (recipe-page, suple-analizer, startlista, equis-automations,
ehobbyhorses, clockin) each reimplemented these; new projects bootstrap from
here instead.

## Architecture

One package, three constructs as named exports. `aws-cdk-lib` and
`constructs` are peer dependencies. TypeScript compiled to CJS on install via
the `prepare` script — nothing is published to a registry.

- `GithubOidcDeployRole` — IAM role assumed by GitHub Actions via the
  account-wide OIDC provider, trust scoped to one repo+branch, permission =
  `sts:AssumeRole` on the `cdk-*` bootstrap roles. Extra grants: add to
  `.role` at the call site.
- `StaticSite` — private S3 bucket + CloudFront (OAC, HTTPS redirect, SPA
  fallbacks), optional custom domain with Route53 A/AAAA records, optional
  `BucketDeployment`. Inner `bucket`/`distribution` are public fields.
- `MonitoredFunction` — `NodejsFunction` with an explicit retention-bounded
  log group and optional side-car SQS DLQ. Inner `fn`/`logGroup`/`dlq` are
  public fields.

## Prerequisites

- Node 22, an AWS CDK v2 app (`aws-cdk-lib` >= 2.173).
- `GithubOidcDeployRole` expects the account-wide GitHub OIDC provider to
  already exist.

## Usage

```json
"dependencies": {
  "@marmaid/cdk-constructs": "github:mrudnoru/cdk-constructs#v0.1.0"
}
```

```ts
import { GithubOidcDeployRole, MonitoredFunction, StaticSite } from '@marmaid/cdk-constructs';

new GithubOidcDeployRole(this, 'Deploy', {
  githubRepo: 'mrudnoru/myapp',
  roleName: 'myapp-github-deploy',
});

new StaticSite(this, 'Web', {
  sitePath: path.join(__dirname, '../../frontend/dist'),
  domainNames: ['app.example.com'],
  certificate,   // us-east-1 cert
  hostedZone,
});

new MonitoredFunction(this, 'Job', {
  entry: path.join(__dirname, '../../src/job.ts'),
  withDlq: true,
});
```

## Development

```bash
npm install
npm test
npm run build
```

Release = commit + `git tag vX.Y.Z`; consumers pin the tag. Never `npm publish`.
