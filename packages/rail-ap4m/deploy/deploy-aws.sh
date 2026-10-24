#!/usr/bin/env bash
# Deploys the x402 Merchant: EC2 (Node service) behind CloudFront (HTTPS). Idempotent where it matters.
# Usage: AWS_PROFILE=... bash deploy/deploy-aws.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=flowcheck-artifacts-$ACCOUNT
ROLE=flowcheck-merchant-role
SG_NAME=flowcheck-merchant-sg
NAME=flowcheck-merchant

# 1 · Bundle (Mastercard kit included: hackathon use only, private bucket)
aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || aws s3api create-bucket --bucket "$BUCKET" >/dev/null
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
tar -czf /tmp/merchant.tgz package.json scripts/common.mjs scripts/merchant.mjs vendor
aws s3 cp /tmp/merchant.tgz "s3://$BUCKET/merchant.tgz" >/dev/null

# 2 · Instance role: read the bundle and the network state secret
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  sleep 12
fi
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id flowcheck/testnet-state --query ARN --output text)
aws iam put-role-policy --role-name "$ROLE" --policy-name merchant --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/*\"},{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"$SECRET_ARN\"}]}"

# 3 · Security group: port 4308 only from CloudFront
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$SG_NAME Name=vpc-id,Values=$VPC --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name $SG_NAME --description "Flow Check merchant (CloudFront only)" --vpc-id "$VPC" --query GroupId --output text)
  PL=$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions "IpProtocol=tcp,FromPort=4308,ToPort=4308,PrefixListIds=[{PrefixListId=$PL}]" >/dev/null
fi

# 4 · Instance
ID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=$NAME Name=instance-state-name,Values=pending,running --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$ID" = "None" ]; then
  AMI=$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query 'Parameters[0].Value' --output text)
  sed "s/__BUCKET__/$BUCKET/g" deploy/bootstrap.sh > /tmp/bootstrap.sh
  ID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small --iam-instance-profile Name=$ROLE --security-group-ids "$SG" \
    --user-data file:///tmp/bootstrap.sh --metadata-options HttpTokens=required \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" --query 'Instances[0].InstanceId' --output text)
  aws ec2 wait instance-running --instance-ids "$ID"
fi
HOST=$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicDnsName' --output text)

# 5 · CloudFront (HTTPS), no caching, all viewer headers forwarded
DIST=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$NAME'].Id | [0]" --output text)
if [ "$DIST" = "None" ] || [ -z "$DIST" ]; then
  cat > /tmp/cf.json <<JSON
{"CallerReference":"$NAME-$(date +%s)","Comment":"$NAME","Enabled":true,
 "Origins":{"Quantity":1,"Items":[{"Id":"merchant","DomainName":"$HOST","CustomOriginConfig":{"HTTPPort":4308,"HTTPSPort":443,"OriginProtocolPolicy":"http-only","OriginReadTimeout":60}}]},
 "DefaultCacheBehavior":{"TargetOriginId":"merchant","ViewerProtocolPolicy":"https-only",
   "CachePolicyId":"4135ea2d-6df8-44a3-9df3-4b5a84be39ad","OriginRequestPolicyId":"b689b0a8-53d0-40ab-baf2-68738e2966ac",
   "AllowedMethods":{"Quantity":2,"Items":["GET","HEAD"],"CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}},"Compress":false},
 "PriceClass":"PriceClass_100"}
JSON
  DIST=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf.json --query Distribution.Id --output text)
fi
DOMAIN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)

# 6 · Tell the Merchant its public URL (it starts once this file exists)
printf 'RESOURCE_URL=https://%s/resource\n' "$DOMAIN" > /tmp/merchant.env
aws s3 cp /tmp/merchant.env "s3://$BUCKET/merchant.env" >/dev/null
echo "Merchant: https://$DOMAIN/resource (instance $ID, distribution $DIST; CloudFront takes a few minutes to deploy)"
