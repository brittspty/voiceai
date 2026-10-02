# Deploy Voice Operations on a small AWS server

This is the pilot setup: one small ARM instance runs the same `docker-compose` stack as local development (app, worker, Postgres, Redis). Caddy gets a certificate and serves HTTPS, including the GoHighLevel, ElevenLabs, and Twilio webhooks. Nothing in this repository talks to AWS by itself. You apply it from a machine that already has credentials.

## Rough monthly cost (us-east-1)

| Piece | Pilot choice | About |
| --- | --- | --- |
| Compute | `t4g.small` (2 vCPU, 2 GB) | $13 |
| Root disk | 40 GB gp3 | $3 |
| Public IPv4 | attached Elastic IP | $0 while attached to a running instance, about $4 if left unattached |
| Backups | S3, a few hundred MB, 30-day expiry | under $1 |
| DNS | Route 53 hosted zone, if you use one | $0.50 |
| Logs | Docker json-file rotation on the box | $0 |
| Data transfer | light webhook and UI traffic | $1–5 |

A comfortable pilot is about **$20–30 a month**. Move to `t4g.medium` (4 GB, about $25 of compute) if builds or Postgres feel tight. Lightsail is the same idea with less wiring: the $12 2 GB or $24 4 GB Linux bundle, then follow the “on the server” steps below and point backups at an S3 bucket you create by hand. Skip Terraform in that case.

CloudWatch is optional. The instance role can write logs, but the default is Docker’s log rotation plus `/etc/logrotate.d/voiceops` from user data.

## 1. Create the server

From `infra/aws`, with Terraform 1.6+ and AWS credentials configured locally:

```bash
cp terraform.tfvars.example terraform.tfvars
# edit ssh_cidr, public_key, and domain
terraform init
terraform apply
terraform output
```

`terraform output public_ip` is the address for an A record:

```text
voice.example.com.  A  <public_ip>
```

Wait until the name resolves before starting Caddy, or certificate issuance fails.

Security group: SSH only from `ssh_cidr`, and 80/443 open so Caddy and the webhooks are reachable. Postgres and Redis stay on the compose network and are not published in the production override.

## 2. Put the app on the box

```bash
ssh ec2-user@$(terraform output -raw public_ip)
sudo mkdir -p /opt/voiceops
sudo chown ec2-user /opt/voiceops
```

From your laptop, copy the repo (no `node_modules`, no `.env`):

```bash
rsync -av --exclude node_modules --exclude .next --exclude .git --exclude .env ./ ec2-user@<ip>:/opt/voiceops/
```

On the server, create `/opt/voiceops/.env` with mode `600`. Start from `.env.example`. For compose on the server the database URL is overridden to `postgres` and `redis` hostnames, so the values that matter are:

```bash
SESSION_SECRET=<long random string>
INTEGRATIONS_MODE=mock
APP_URL=https://voice.example.com
SITE_ADDRESS=voice.example.com
```

Leave the vendor keys empty until you are ready to leave mock mode. Alternatively store the same keys in SSM Parameter Store under `/voiceops/prod/` (the instance role can read that path) and render the file:

```bash
aws ssm get-parameters-by-path --path /voiceops/prod --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
  while read -r name value; do
    key=${name##*/}
    printf '%s=%s\n' "$key" "$value"
  done > /opt/voiceops/.env
chmod 600 /opt/voiceops/.env
```

## 3. Start the stack with HTTPS

```bash
cd /opt/voiceops
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
curl -fsS https://voice.example.com/api/health
```

Caddy (`Caddyfile`) reverse-proxies the domain to the app container and obtains a Let’s Encrypt certificate. Webhook URLs:

- `https://voice.example.com/api/webhooks/ghl`
- `https://voice.example.com/api/webhooks/elevenlabs`
- `https://voice.example.com/api/webhooks/twilio`

Sign bodies with the webhook secrets in `.env`, or send the secret in `x-webhook-secret`.

Sign in as the seeded owner (see the README) and confirm Overview, Calls, and the Test console.

## 4. Nightly Postgres backups

```bash
sudo tee /etc/cron.d/voiceops-backup >/dev/null <<EOF
15 7 * * * ec2-user cd /opt/voiceops && BACKUP_BUCKET=$(terraform output -raw backup_bucket) /opt/voiceops/scripts/backup-postgres.sh >> /var/log/voiceops-backup.log 2>&1
EOF
```

The bucket expires objects after 30 days. Restore with `gunzip` and `psql` into the Postgres container. Take a backup before the first live dials.

## 5. Logs

Compose is set to Docker `json-file` logs, 10 MB × 5 files per container. User data also installs a logrotate snippet for container logs. To ship somewhere later, point the CloudWatch agent at `/var/lib/docker/containers` or switch the compose logging driver. You do not need that for the pilot.

## 6. Go live on this same server

Still one box. In `.env` set `INTEGRATIONS_MODE=live` and the GoHighLevel, ElevenLabs, and Twilio variables from `.env.example`. Restart app and worker. In the product, an owner turns test mode off and the schedule on only after Production ready is green. Rotate the Twilio token and use a fresh ElevenLabs key before the pilot.

## When to leave the single server

Stay here while one office is in pilot and the dialer is within the daily cap (the default is 50). Move when Postgres CPU stays high, you want the database patched without touching the app, or you need more than one app instance.

The later shape, not built in this repo:

1. Restore a backup into RDS Postgres and point `DATABASE_URL` at it.
2. Put Redis on ElastiCache, or keep the Postgres job table and drop Redis (the worker already polls Postgres if Redis is down).
3. Run the same image as two ECS Fargate services (app and worker) behind an ALB with an ACM certificate.
4. Move `.env` into Secrets Manager and inject it into the task definitions.
5. Keep S3 backups, or switch RDS automated backups on and retire the cron dump.

The app does not need a rewrite for that move. It already reads configuration only from the environment.
