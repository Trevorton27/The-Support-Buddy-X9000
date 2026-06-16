# AWS IAM Permission Denied for Lambda Execution Role

**Source Type:** SUPPORT_TICKET
**Tags:** aws, iam, lambda, permissions, execution-role, s3
**Product Area:** Infrastructure
**Severity:** high

## Ticket Summary
Customer deployed a new Lambda function that reads from an S3 bucket and writes results to
DynamoDB. The function deployed successfully but failed on every invocation with:
`AccessDeniedException: User: arn:aws:sts::123456789:assumed-role/lambda-exec-role/function-name
is not authorized to perform: s3:GetObject on resource: arn:aws:s3:::customer-data-bucket/*`

## Root Cause
The Lambda execution role had a policy that referenced the S3 bucket ARN without the `/*`
suffix for object-level access. S3 requires separate ARN statements for bucket-level actions
(`s3:ListBucket` on `arn:aws:s3:::bucket-name`) and object-level actions (`s3:GetObject` on
`arn:aws:s3:::bucket-name/*`). The customer's policy only had the bucket ARN, which does not
grant object access.

## Resolution Applied
1. Retrieved the Lambda execution role from the AWS console: IAM → Roles → lambda-exec-role.
2. Identified the S3 policy — it had `s3:GetObject` but the resource was `arn:aws:s3:::customer-data-bucket` (missing `/*`).
3. Updated the inline policy to include the correct resource:
   ```json
   {
     "Effect": "Allow",
     "Action": ["s3:GetObject", "s3:PutObject"],
     "Resource": "arn:aws:s3:::customer-data-bucket/*"
   }
   ```
4. Added a separate statement for `s3:ListBucket` on the bucket ARN (without `/*`) for directory listing.
5. Lambda invocations succeeded immediately after policy update.

## Time to Resolution
45 minutes

## Lessons Learned
- S3 object vs. bucket ARN distinction is one of the most common IAM mistakes.
- Always use `/*` suffix for object-level S3 actions in IAM policies.
- The CloudWatch error message includes the exact action and resource ARN — read it carefully before guessing.
- IAM policy simulator (`policy-simulator.s3.amazonaws.com`) can validate policies before deployment.

## Related References
- Architecture Doc: API Gateway Architecture
- Runbook: CI/CD Pipeline Failures
