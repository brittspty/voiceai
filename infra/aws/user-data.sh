#!/bin/bash
set -eux
dnf update -y
dnf install -y docker git awscli cronie
systemctl enable --now docker
systemctl enable --now crond
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins /opt/voiceops
curl -SL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
install -o ec2-user -g ec2-user -m 644 /dev/null /var/log/voiceops-backup.log
# t4g.small has 2 GB. Add 2 GB of swap when total memory is under 3 GB so image builds can finish.
mem_kb=$(awk '/MemTotal:/ { print $2 }' /proc/meminfo)
if [ "$mem_kb" -lt 3145728 ]; then
  if [ ! -f /swapfile ]; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  if ! swapon --show | grep -q '/swapfile'; then
    swapon /swapfile
  fi
  grep -q '/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
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
