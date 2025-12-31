output "dashboard_url" {
  description = "URL of the dashboard website"
  value       = "http://${aws_s3_bucket.dashboard.bucket}.s3-website-${var.aws_region}.amazonaws.com"
}

output "api_gateway_url" {
  description = "URL of the API Gateway"
  value       = "https://${aws_api_gateway_rest_api.dashboard_api.id}.execute-api.${var.aws_region}.amazonaws.com/prod"
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for notifications"
  value       = aws_sns_topic.incidents.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB incidents table"
  value       = aws_dynamodb_table.incidents.name
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for dashboard"
  value       = aws_s3_bucket.dashboard.bucket
}
