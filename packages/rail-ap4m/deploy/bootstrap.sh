#!/bin/bash
# EC2 user data: installs Node 22, fetches the Merchant bundle and runs it as a service.
set -euxo pipefail
REGION=us-east-1
BUCKET=__BUCKET__
SECRET=flowcheck/testnet-state
cd /opt
curl -fsSL https://nodejs.org/dist/v22.13.1/node-v22.13.1-linux-arm64.tar.xz | tar -xJ
ln -sf /opt/node-v22.13.1-linux-arm64/bin/node /usr/local/bin/node
ln -sf /opt/node-v22.13.1-linux-arm64/bin/npm /usr/local/bin/npm
mkdir -p /opt/merchant /var/lib/flowcheck && cd /opt/merchant
aws s3 cp s3://$BUCKET/merchant.tgz . --region $REGION && tar -xzf merchant.tgz
npm install --omit=dev --no-audit --no-fund ethers@6.17.0 ./vendor/ap4m-sdk.tgz
cat > /usr/local/bin/flowcheck-merchant <<'RUN'
#!/bin/bash
set -euo pipefail
cd /opt/merchant
# Wait for the public URL (written once CloudFront exists), then read the Agent key from Secrets Manager
until aws s3 cp s3://__BUCKET__/merchant.env /opt/merchant/merchant.env --region us-east-1 >/dev/null 2>&1; do sleep 10; done
set -a; . /opt/merchant/merchant.env; set +a
export AGENT_PRIVATE_KEY=$(aws secretsmanager get-secret-value --secret-id flowcheck/testnet-state --region us-east-1 --query SecretString --output text | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).ap4m.agentKey))')
export STATE_DIR=/var/lib/flowcheck HOST=0.0.0.0 PORT=4308
exec node scripts/merchant.mjs
RUN
chmod +x /usr/local/bin/flowcheck-merchant
cat > /etc/systemd/system/flowcheck-merchant.service <<'UNIT'
[Unit]
Description=Fluxyn Flow Check x402 Merchant
After=network-online.target
[Service]
ExecStart=/usr/local/bin/flowcheck-merchant
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now flowcheck-merchant
