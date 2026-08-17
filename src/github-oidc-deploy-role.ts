import { Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GithubOidcDeployRoleProps {
  /** GitHub "owner/repo" allowed to assume this role. */
  readonly githubRepo: string;
  /** IAM role name, e.g. "myapp-github-deploy". */
  readonly roleName: string;
  /** Branch allowed to deploy. @default 'main' */
  readonly branch?: string;
}

/**
 * IAM role assumed by GitHub Actions via the account-wide OIDC provider to run
 * `cdk deploy`. Trust is scoped to one repo+branch; the only permission is
 * assuming the CDK bootstrap roles (cdk-*), which hold the real deploy access.
 * App-specific extras (SSM reads, S3 sync, ...) go on `role` at the call site.
 * The account-wide provider must already exist — AWS allows one per URL, so
 * this construct never creates it.
 */
export class GithubOidcDeployRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcDeployRoleProps) {
    super(scope, id);

    const account = Stack.of(this).account;
    const branch = props.branch ?? 'main';

    this.role = new iam.Role(this, 'Role', {
      roleName: props.roleName,
      description: `Assumed by GitHub Actions (OIDC) from ${props.githubRepo} to run cdk deploy`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(
        `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
        {
          StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:ref:refs/heads/${branch}`,
          },
        },
      ),
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${account}:role/cdk-*`],
      }),
    );
  }
}
