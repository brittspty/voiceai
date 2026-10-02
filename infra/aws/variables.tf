variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "voiceops"
}

variable "instance_type" {
  type        = string
  default     = "t4g.small"
  description = "t4g.small (2 GB) is the cheap pilot. Use t4g.medium (4 GB) if the box feels tight."
}

variable "ssh_cidr" {
  type        = string
  description = "Your IP in CIDR form, for SSH. Example: 203.0.113.10/32"
}

variable "public_key" {
  type        = string
  description = "SSH public key material, for example the contents of ~/.ssh/id_ed25519.pub"
}

variable "domain" {
  type        = string
  description = "Public hostname Caddy will certificate. Point an A record at the instance IP."
}
