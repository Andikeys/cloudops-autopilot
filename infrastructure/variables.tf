variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project (used for resource naming)"
  type        = string
  default     = "cloudops-autopilot"
}

variable "notification_email" {
  description = "Email address for incident notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "CloudOps Autopilot"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
