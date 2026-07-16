# Production deployment

Target: Cloudflare Pages at `ramseytools.com`, AWS ECS at
`api.ramseytools.com`, and Resend at `mail.ramseytools.com`.

## 1. Request the API certificate

1. AWS Console → region **Europe (Frankfurt) `eu-central-1`** → Certificate Manager.
2. Request a public certificate for `api.ramseytools.com` with DNS validation.
3. In Cloudflare DNS, add ACM's validation CNAME as **DNS only**.
4. Wait for ACM status **Issued** and copy the certificate ARN.

## 2. First AWS deploy

Do this after the prepared code is on `master`. Sign in as `ramsey-admin`, open
AWS CloudShell in Frankfurt, then run:

```bash
git clone https://github.com/szilagyib/RAMSey.git
cd RAMSey
npm ci

export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export CERTIFICATE_ARN='<ACM_CERTIFICATE_ARN>'

npx cdk bootstrap "aws://${ACCOUNT_ID}/eu-central-1" \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess

npm run infra:deploy -- \
  --require-approval never \
  --parameters CertificateArn="${CERTIFICATE_ARN}"
```

CloudShell uses the signed-in console session, so no access key is created or
stored. Save these stack outputs:

- `ApiLoadBalancerDnsName`
- `GitHubDeployRoleArn`
- `ApplicationSecretName`

## 3. Install the Resend key

1. AWS Console → Secrets Manager → `ramsey/production/application`.
2. Retrieve and edit the secret.
3. Replace **only** `SMTP_PASS` with the Resend key saved in Bitwarden. Keep the
   generated `JWT_SECRET` unchanged.
4. ECS → `ramsey-production` → `ramsey-api` → **Update** →
   **Force new deployment**.

The stack already sets `smtp.resend.com`, port `465`, user `resend`, and
`RAMSey <no-reply@mail.ramseytools.com>`.

## 4. Connect `api.ramseytools.com`

1. Cloudflare DNS → add CNAME `api` → the `ApiLoadBalancerDnsName` output.
2. Set it to **Proxied**.
3. Cloudflare SSL/TLS mode → **Full (strict)**.
4. Verify `https://api.ramseytools.com/api/health` returns `{"status":"ok",...}`.

Do not remove the ACM validation CNAME.
The load balancer accepts only Cloudflare's published IPv4 ranges; update
`CLOUDFLARE_IPV4_CIDRS` if Cloudflare changes that list.

## 5. Deploy the frontend

Cloudflare Pages → create project → connect `szilagyib/RAMSey`:

| Setting           | Value                         |
| ----------------- | ----------------------------- |
| Production branch | `master`                      |
| Root directory    | repository root / blank       |
| Build command     | `npm run build:frontend`      |
| Build output      | `packages/frontend/dist`      |
| `NODE_VERSION`    | `22`                          |
| `VITE_API_ORIGIN` | `https://api.ramseytools.com` |

Add `ramseytools.com` as the production custom domain. Add
`www.ramseytools.com`, then create a Cloudflare redirect from `www` to the apex
domain. Verify registration, the six-digit confirmation email, login, and one
saved diagram.

## 6. Enable keyless GitHub deploys

GitHub → repository Settings → Secrets and variables → Actions → Variables:

- `AWS_DEPLOY_ROLE_ARN` = `GitHubDeployRoleArn` output
- `AWS_CERTIFICATE_ARN` = the ACM certificate ARN

Future backend/infrastructure pushes to `master` run release gates and deploy
through OIDC. No AWS access key belongs in GitHub.

## Optional services

Google OAuth and Anthropic stay hidden until configured. To enable Google, set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the application secret, add
`https://api.ramseytools.com/api/auth/google/callback` as the authorized Google
redirect URI, then force a new API deployment. Configure Anthropic and Sentry
the same way using their existing empty keys.
