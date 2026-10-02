#!/bin/bash
set -eux
dnf update -y
dnf install -y docker git awscli
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins /opt/voiceops
curl -SL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
cat >/etc/logrotate.d/voiceops <<'EOF'
/var/lib/docker/containers/*/*.log {
  daily
  rotate 7
  compress
  missingok
  copytruncate
}
EOF
echo "voiceops bootstrap done" > /opt/voiceops/BOOTSTRAPPED
