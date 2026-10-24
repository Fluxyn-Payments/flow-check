#!/usr/bin/env bash
# Deploys the Flow Check API + monitor as one Lambda with a public HTTPS URL.
# Usage: AWS_PROFILE=... bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
FN=flowcheck-api
ROLE=flowcheck-api-role
SECRET=flowcheck/testnet-state
STATE_DIR="${FLOWCHECK_DIR:-../../packages/flow-check/.flowcheck}"
aws_() { aws --region "$REGION" "$@"; }

pnpm build >/dev/null
(cd ../web && pnpm build >/dev/null)
rm -rf dist/web && cp -R ../web/dist dist/web

# 1 · Network state (with seeds) and Mandates → Secrets Manager
STATE=$(node -e '
const fs=require("fs"),p=require("path"),d=process.argv[1];
const s=JSON.parse(fs.readFileSync(p.join(d,"testnet.json")));s.mandates={};try{s.ap4m={agentKey:fs.readFileSync(p.join(d,"agent-private-key"),"utf8").trim()}}catch{};
for(const f of fs.readdirSync(p.join(d,"mandates")))s.mandates[f.replace(".json","")]=JSON.parse(fs.readFileSync(p.join(d,"mandates",f)));
process.stdout.write(JSON.stringify(s));' "$STATE_DIR")
if aws_ secretsmanager describe-secret --secret-id "$SECRET" >/dev/null 2>&1; then
  aws_ secretsmanager put-secret-value --secret-id "$SECRET" --secret-string "$STATE" >/dev/null
else
  aws_ secretsmanager create-secret --name "$SECRET" --description "Flow Check testnet state (hackathon)" --secret-string "$STATE" >/dev/null
fi
SECRET_ARN=$(aws_ secretsmanager describe-secret --secret-id "$SECRET" --query ARN --output text)

# 2 · Execution role
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name invoke-claude --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":["arn:aws:bedrock:*::foundation-model/anthropic.*","arn:aws:bedrock:*:*:inference-profile/us.anthropic.*"]}]}'
aws iam put-role-policy --role-name "$ROLE" --policy-name read-state --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"$SECRET_ARN\"}]}"
ROLE_ARN=$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)

# 3 · Demo token (kept locally, never committed)
TOKEN_FILE="$STATE_DIR/demo-token"
[ -f "$TOKEN_FILE" ] || node -e 'process.stdout.write(require("crypto").randomBytes(12).toString("hex"))' > "$TOKEN_FILE"
TOKEN=$(cat "$TOKEN_FILE")

# 4 · Function
(cd dist && rm -f fn.zip && zip -qr fn.zip index.mjs web)
# Optional: Anthropic API key for the agent (file kept next to the testnet state, never committed)
KEY_FILE="$STATE_DIR/anthropic-key"
EXTRA=""
[ -s "$KEY_FILE" ] && EXTRA=",ANTHROPIC_API_KEY=$(tr -d '\n' < "$KEY_FILE")"
ENV="Variables={STATE_SECRET_ID=$SECRET,DEMO_TOKEN=$TOKEN,NODE_OPTIONS=--enable-source-maps$EXTRA}"
if aws_ lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws_ lambda update-function-code --function-name "$FN" --zip-file fileb://dist/fn.zip >/dev/null
  aws_ lambda wait function-updated --function-name "$FN"
  aws_ lambda update-function-configuration --function-name "$FN" --environment "$ENV" --timeout 300 >/dev/null
else
  aws_ lambda create-function --function-name "$FN" --runtime nodejs22.x --handler index.handler --role "$ROLE_ARN" \
    --zip-file fileb://dist/fn.zip --timeout 300 --memory-size 512 --environment "$ENV" >/dev/null
fi
aws_ lambda wait function-updated --function-name "$FN" 2>/dev/null || aws_ lambda wait function-active --function-name "$FN"

# 5 · Public HTTPS URL
if ! aws_ lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  aws_ lambda create-function-url-config --function-name "$FN" --auth-type NONE >/dev/null
  aws_ lambda add-permission --function-name "$FN" --statement-id public-url --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  node scripts/url-permission.mjs "$FN" "$REGION"
fi
URL=$(aws_ lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)
echo "Deployed: $URL"
echo "Demo token: stored in $TOKEN_FILE"
