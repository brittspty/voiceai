output "public_ip" {
  value = aws_eip.pilot.public_ip
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "ssh" {
  value = "ssh ec2-user@${aws_eip.pilot.public_ip}"
}

output "webhook_base" {
  value = "https://${var.domain}"
}
