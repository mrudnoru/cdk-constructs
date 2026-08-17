import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { GithubOidcDeployRole } from '../src/github-oidc-deploy-role';

function template(branch?: string): Template {
  const stack = new Stack(new App(), 'Test', {
    env: { account: '111111111111', region: 'eu-west-1' },
  });
  new GithubOidcDeployRole(stack, 'Deploy', {
    githubRepo: 'me/app',
    roleName: 'app-github-deploy',
    branch,
  });
  return Template.fromStack(stack);
}

describe('GithubOidcDeployRole', () => {
  it('creates a role trusting the account-wide GitHub OIDC provider, scoped to repo and main branch', () => {
    template().hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'app-github-deploy',
      MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Principal: {
              Federated:
                'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com',
            },
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              },
              StringLike: {
                'token.actions.githubusercontent.com:sub': 'repo:me/app:ref:refs/heads/main',
              },
            },
          }),
        ],
      }),
    });
  });

  it('grants only sts:AssumeRole on the cdk-* bootstrap roles', () => {
    template().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Resource: 'arn:aws:iam::111111111111:role/cdk-*',
          }),
        ],
      }),
    });
  });

  it('scopes trust to a custom branch when given', () => {
    template('deploy').hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub': 'repo:me/app:ref:refs/heads/deploy',
              },
            }),
          }),
        ],
      }),
    });
  });
});
